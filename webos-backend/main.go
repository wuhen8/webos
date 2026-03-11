package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"webos-backend/internal/cli"
	"webos-backend/internal/config"
	"webos-backend/internal/database"
	"webos-backend/internal/handler"
	"webos-backend/internal/response"
	"webos-backend/internal/service"
	"webos-backend/internal/storage"
	"webos-backend/internal/wasm"

	"github.com/gin-gonic/gin"
)

//go:embed sdk/webos-sdk.js
var fmSDKJS []byte

//go:embed dist/*
var distFS embed.FS

func getDistFS() (fs.FS, error) {
	return fs.Sub(distFS, "dist")
}

// requestHostname extracts the hostname (without port) from the request's Host header.
func requestHostname(r *http.Request) string {
	if u, err := url.Parse("http://" + r.Host); err == nil {
		return u.Hostname()
	}
	return r.Host
}

func main() {
	// CLI mode: webos <command> [args...]
	if len(os.Args) > 1 && !strings.HasPrefix(os.Args[1], "-") {
		cli.Run(os.Args[1:])
		return
	}

	// 初始化 SQLite 数据库
	if err := database.Init(config.ConfigDir()); err != nil {
		fmt.Printf("Fatal: failed to initialize database: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	if err := storage.ReloadDrivers(); err != nil {
		fmt.Printf("Warning: failed to initialize storage drivers: %v\n", err)
	}

	// Initialize AI service and executor (requires DB + storage to be ready)
	handler.InitAI()

	// Recover S3 upload sessions from DB before accepting new requests
	handler.RecoverS3Uploads()

	service.InitDefaultSkipDirs()

	// Download IP geolocation database if not present (async, non-blocking)
	go service.EnsureIPDB()

	// Initialize unified firewall service: wire notifications and auto-restore from DB
	handler.InitFirewall()

	// Reconcile static apps (sync disk → DB)
	service.ReconcileWebApps()

	// Initialize wasm runtime and start background wasm apps (async)
	wasmRT := wasm.GetRuntime()
	handler.InitWasmBridge()
	wasmRT.IsAutostart = func(appID string) bool {
		app, err := service.GetAppStatus(appID)
		if err != nil {
			return false
		}
		return app.Autostart
	}
	go wasmRT.StartBackgroundApps()

	// Wire up CleanStaleUploads for scheduled jobs
	service.CleanStaleUploadsFn = handler.CleanStaleUploads

	scheduler := service.GetScheduler()
	service.SeedDefaultJobs()
	service.LoadPersistedJobs(service.NewSystemService(), service.NewFileService())
	go func() {
		scheduler.Start()
	}()

	r := gin.Default()

	// CORS中间件 — 允许同源请求及 Capacitor App（localhost）
	r.Use(func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			parsed, err := url.Parse(origin)
			if err == nil && (parsed.Hostname() == requestHostname(c.Request) || parsed.Hostname() == "localhost") {
				c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
				c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
				c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			}
		}

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// API路由
	api := r.Group("/api")
	{
		api.POST("/login", handler.LoginHandler)
		api.GET("/auth/status", handler.AuthStatusHandler)
		api.POST("/setup-password", handler.SetupPasswordHandler)
		api.GET("/user", handler.JWTAuthMiddleware(), handler.UserInfoHandler)

		authApi := api.Group("")
		authApi.Use(handler.JWTAuthMiddleware())
		authApi.PUT("/password", handler.UpdatePasswordHandler)

		// File upload/download (binary streams, remain HTTP)
		authApi.POST("/fs/:node_id/upload", handler.FsUploadHandler)
		authApi.POST("/fs/:node_id/upload/init", handler.FsUploadInitHandler)
		authApi.POST("/fs/:node_id/upload/chunk", handler.FsUploadChunkHandler)
		authApi.POST("/fs/:node_id/upload/complete", handler.FsUploadCompleteHandler)
		authApi.DELETE("/fs/:node_id/upload/:upload_id", handler.FsUploadAbortHandler)
		authApi.GET("/fs/:node_id/upload/:upload_id/parts", handler.FsUploadPartsHandler)
		authApi.POST("/fs/:node_id/upload/:upload_id/presign", handler.FsUploadPresignHandler)
		authApi.GET("/fs/:node_id/presign", handler.FsPresignHandler)
		authApi.GET("/fs/:node_id/download/sign", handler.FsDownloadSignHandler)
		api.GET("/fs/:node_id/download", handler.FsDownloadHandler)
		api.GET("/share/:token", handler.ShareDownloadHandler)

		// Static app upload
		authApi.POST("/webapps/upload", handler.WebAppUploadHandler)

		// Web proxy — strips X-Frame-Options / CSP so external sites can be iframed
		// Auth is handled inside the handler via query-param token (iframe can't set headers)
	}
	api.GET("/proxy", handler.ProxyHandler)

	// External AI API — uses API token auth, not JWT
	api.POST("/ai/send", handler.ExternalAISendHandler)

	// System notification broadcast — uses API token auth
	api.POST("/notify", handler.ExternalNotifyHandler)

	// 本地命令执行 — 仅 localhost 免认证
	api.POST("/command", handler.CommandHandler)

	// 统一 WebSocket（首条消息认证）
	r.GET("/api/ws", func(c *gin.Context) {
		handler.HandleUnifiedWS(c.Writer, c.Request)
	})

	// WebOS SDK for static apps
	r.GET("/webos-sdk.js", func(c *gin.Context) {
		c.Data(http.StatusOK, "application/javascript; charset=utf-8", fmSDKJS)
	})

	// Static apps file serving (no auth — security is enforced at the SDK bridge layer)
	r.GET("/webapps/:appId/*filepath", func(c *gin.Context) {
		handler.ServeWebApp(c)
	})

	// 嵌入前端静态资源
	distSubFS, err := getDistFS()
	if err != nil {
		fmt.Printf("Warning: Failed to load embedded frontend: %v\n", err)
	} else {
		r.GET("/", func(c *gin.Context) {
			c.FileFromFS("/", http.FS(distSubFS))
		})
		r.GET("/assets/*filepath", func(c *gin.Context) {
			c.FileFromFS(c.Request.URL.Path, http.FS(distSubFS))
		})
		r.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			if strings.HasPrefix(path, "/api") {
				response.Error(c, http.StatusNotFound, 404, "Not found")
				return
			}
			if f, err := distSubFS.Open(strings.TrimPrefix(path, "/")); err == nil {
				f.Close()
				c.FileFromFS(path, http.FS(distSubFS))
				return
			}
			c.FileFromFS("/", http.FS(distSubFS))
		})
	}

	// Graceful shutdown with http.Server
	port := config.Port()
	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: r,
	}

	// Start server in goroutine
	go func() {
		fmt.Printf("Server running on http://localhost:%d\n", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	log.Printf("Received signal %v, shutting down...", sig)

	// Graceful shutdown sequence
	service.GetFirewallService().Guard().Stop()
	log.Println("IP guard stopped")

	scheduler.Stop()
	log.Println("Scheduler stopped")

	wasmRT.Close()
	log.Println("Wasm runtime stopped")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	} else {
		log.Println("HTTP server stopped")
	}

	database.Close()
	log.Println("Database closed. Goodbye.")
}
