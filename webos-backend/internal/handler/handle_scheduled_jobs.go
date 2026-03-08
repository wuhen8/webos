package handler

import (
	"encoding/json"
	"fmt"
	"time"

	"webos-backend/internal/service"
)

func init() {
	RegisterHandlers(map[string]Handler{
		"scheduled_job.list":   handleScheduledJobsList,
		"scheduled_job.create": handleScheduledJobCreate,
		"scheduled_job.update": handleScheduledJobUpdate,
		"scheduled_job.delete": handleScheduledJobDelete,
		"scheduled_job.run":    handleScheduledJobRun,
	})
}

func handleScheduledJobsList(c *WSConn, raw json.RawMessage) {
	var p struct{ baseReq }
	json.Unmarshal(raw, &p)
	c.Reply("scheduled_job.list", p.ReqID, service.GetScheduler().GetAllStatus())
}

func handleScheduledJobCreate(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		JobID        string `json:"jobId"`
		JobName      string `json:"jobName"`
		JobType      string `json:"jobType"`
		JobConfig    string `json:"jobConfig"`
		CronExpr     string `json:"cronExpr"`
		Enabled      *bool  `json:"enabled"`
		Silent       *bool  `json:"silent"`
		ScheduleType string `json:"scheduleType"`
		RunAt        int64  `json:"runAt"`
	}
	json.Unmarshal(raw, &p)

	jobID := p.JobID
	if jobID == "" {
		jobID = "user_" + genSid()
	}
	enabled := true
	if p.Enabled != nil {
		enabled = *p.Enabled
	}
	silent := false
	if p.Silent != nil {
		silent = *p.Silent
	}
	scheduleType := p.ScheduleType
	if scheduleType == "" {
		scheduleType = "cron"
	}
	cronExpr := p.CronExpr
	if scheduleType == "once" {
		if p.RunAt <= 0 {
			c.ReplyErr("scheduled_job.create", p.ReqID, fmt.Errorf("runAt is required for one-time jobs"))
			return
		}
		if p.RunAt < time.Now().UnixMilli() {
			c.ReplyErr("scheduled_job.create", p.ReqID, fmt.Errorf("runAt must be a future timestamp (unix milliseconds)"))
			return
		}
		// One-time jobs don't need a real cron expression
		cronExpr = ""
	} else {
		if cronExpr == "" {
			cronExpr = "0 */1 * * * *"
		}
		if _, err := service.ParseCron(cronExpr); err != nil {
			c.ReplyErr("scheduled_job.create", p.ReqID, err)
			return
		}
	}
	if err := service.DBCreateJob(jobID, p.JobName, p.JobType, p.JobConfig, cronExpr, enabled, silent, scheduleType, p.RunAt); err != nil {
		c.ReplyErr("scheduled_job.create", p.ReqID, err)
		return
	}
	job := service.ScheduledJob{
		ID:           jobID,
		Name:         p.JobName,
		CronExpr:     cronExpr,
		Run:          service.MakeJobRunFunc(jobID, p.JobType, p.JobConfig, silent, systemSvc, fileSvc),
		Silent:       silent,
		Enabled:      enabled,
		JobType:      p.JobType,
		Config:       p.JobConfig,
		ScheduleType: scheduleType,
		RunAt:        p.RunAt,
	}
	service.GetScheduler().AddJob(job)
	c.Reply("scheduled_job.create", p.ReqID, map[string]string{"jobId": jobID})
}

func handleScheduledJobUpdate(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		JobID        string `json:"jobId"`
		JobName      string `json:"jobName"`
		JobType      string `json:"jobType"`
		JobConfig    string `json:"jobConfig"`
		CronExpr     string `json:"cronExpr"`
		Enabled      *bool  `json:"enabled"`
		Silent       *bool  `json:"silent"`
		ScheduleType string `json:"scheduleType"`
		RunAt        int64  `json:"runAt"`
	}
	json.Unmarshal(raw, &p)

	if p.JobID == "" {
		c.ReplyErr("scheduled_job.update", p.ReqID, errRequired("jobId"))
		return
	}
	enabled := true
	if p.Enabled != nil {
		enabled = *p.Enabled
	}
	silent := false
	if p.Silent != nil {
		silent = *p.Silent
	}
	scheduleType := p.ScheduleType
	if scheduleType == "" {
		scheduleType = "cron"
	}
	cronExpr := p.CronExpr
	if scheduleType == "once" {
		cronExpr = ""
	} else {
		if cronExpr == "" {
			cronExpr = "0 */1 * * * *"
		}
		if _, err := service.ParseCron(cronExpr); err != nil {
			c.ReplyErr("scheduled_job.update", p.ReqID, err)
			return
		}
	}
	if err := service.DBUpdateJob(p.JobID, p.JobName, p.JobType, p.JobConfig, cronExpr, enabled, silent, scheduleType, p.RunAt); err != nil {
		c.ReplyErr("scheduled_job.update", p.ReqID, err)
		return
	}
	runFn := service.MakeJobRunFunc(p.JobID, p.JobType, p.JobConfig, silent, systemSvc, fileSvc)
	service.GetScheduler().UpdateJob(p.JobID, p.JobName, cronExpr, p.JobType, p.JobConfig, runFn)
	service.GetScheduler().SetSilent(p.JobID, silent)
	service.GetScheduler().SetOnceSchedule(p.JobID, scheduleType, p.RunAt)
	if p.Enabled != nil {
		if *p.Enabled {
			service.GetScheduler().EnableJob(p.JobID)
		} else {
			service.GetScheduler().DisableJob(p.JobID)
		}
	}
	c.Reply("scheduled_job.update", p.ReqID, nil)
}

func handleScheduledJobDelete(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		JobID string `json:"jobId"`
	}
	json.Unmarshal(raw, &p)
	if p.JobID == "" {
		c.ReplyErr("scheduled_job.delete", p.ReqID, errRequired("jobId"))
		return
	}
	service.DBDeleteJob(p.JobID)
	service.GetScheduler().RemoveJob(p.JobID)
	c.Reply("scheduled_job.delete", p.ReqID, nil)
}

func handleScheduledJobRun(c *WSConn, raw json.RawMessage) {
	var p struct {
		baseReq
		JobID string `json:"jobId"`
	}
	json.Unmarshal(raw, &p)
	if p.JobID == "" {
		c.ReplyErr("scheduled_job.run", p.ReqID, errRequired("jobId"))
		return
	}
	service.GetScheduler().RunNow(p.JobID)
	c.Reply("scheduled_job.run", p.ReqID, nil)
}
