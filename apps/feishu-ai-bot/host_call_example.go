package main

// Example usage of unified host call API
// These functions demonstrate how to use the new JSON-based host capabilities

// Example: Read a file from storage
func exampleReadFile() {
	hostCallAsync("fs.read", map[string]interface{}{
		"nodeId": "local",
		"path":   "/data/config.json",
	}, func(success bool, data interface{}, err string) {
		if !success {
			logMsg("Read file failed: " + err)
			return
		}
		logMsg("File content received")
	})
}

// Example: Write a file to storage
func exampleWriteFile() {
	hostCallAsync("fs.write", map[string]interface{}{
		"nodeId":  "local",
		"path":    "/data/output.txt",
		"content": "Hello from WASM!",
	}, func(success bool, data interface{}, err string) {
		if !success {
			logMsg("Write file failed: " + err)
			return
		}
		logMsg("File written successfully")
	})
}

// Example: List directory
func exampleListDir() {
	hostCallAsync("fs.list", map[string]interface{}{
		"nodeId": "local",
		"path":   "/data",
	}, func(success bool, data interface{}, err string) {
		if !success {
			logMsg("List dir failed: " + err)
			return
		}
		logMsg("Directory listing received")
	})
}

// Example: Execute shell command
func exampleExecCommand() {
	hostCallAsync("process.exec", map[string]interface{}{
		"command": "docker ps",
		"timeout": 30,
	}, func(success bool, data interface{}, err string) {
		if !success {
			logMsg("Exec failed: " + err)
			return
		}
		logMsg("Command executed successfully")
	})
}

// Example: Get system info
func exampleSystemInfo() {
	hostCallAsync("system.info", map[string]interface{}{}, func(success bool, data interface{}, err string) {
		if !success {
			logMsg("Get system info failed: " + err)
			return
		}
		logMsg("System info received")
	})
}

// Example: Get environment variable
func exampleGetEnv() {
	hostCallAsync("system.env", map[string]interface{}{
		"key": "HOME",
	}, func(success bool, data interface{}, err string) {
		if !success {
			logMsg("Get env failed: " + err)
			return
		}
		logMsg("Environment variable received")
	})
}
