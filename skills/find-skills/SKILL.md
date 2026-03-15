---
name: find-skills
description: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.
---

# Find Skills

This skill helps you discover and install skills from the Skillhub skills ecosystem.

## When to Use This Skill

Use this skill when the user:
- Asks "how do I do X" where X might be a common task with an existing skill
- Says "find a skill for X" or "is there a skill for X"
- Asks "can you do X" where X is a specialized capability
- Expresses interest in extending agent capabilities
- Wants to search for tools, templates, or workflows
- Mentions they wish they had help with a specific domain (design, testing, deployment, etc.)

## Skillhub CLI

The Skillhub CLI is the package manager for the Skillhub skills ecosystem. Skills are modular packages that extend agent capabilities with specialized knowledge, workflows, and tools.

**Key commands:**
- `skillhub search [query]` - Search for skills by keyword
- `skillhub install [skill]` - Install a skill (use `--dir` to specify install path)
- `skillhub list` - List installed skills
- `skillhub upgrade` - Upgrade installed skills

**Browse skills at:** https://clawhub.ai/

## For WebOS Users

In WebOS, skills are installed to `/opt/webos/skills/`. Use these commands:

### Search Skills
```bash
python3 /root/.skillhub/skills_store_cli.py search <query>
python3 /root/.skillhub/skills_store_cli.py search calendar
```

### Install Skill (WebOS-specific)
```bash
python3 /root/.skillhub/skills_store_cli.py \
  --dir /opt/webos/skills \
  install <skill-slug>
```
**Important:** Must use `--dir /opt/webos/skills` to install to WebOS directory.

### List Installed Skills
```bash
python3 /root/.skillhub/skills_store_cli.py --dir /opt/webos/skills list
```

### Upgrade Skills
```bash
# Upgrade all
python3 /root/.skillhub/skills_store_cli.py --dir /opt/webos/skills upgrade

# Upgrade specific skill
python3 /root/.skillhub/skills_store_cli.py --dir /opt/webos/skills upgrade <slug>
```

## How to Help Users Find Skills

### Step 1: Understand What They Need
When a user asks for help with something, identify:
1. The domain (e.g., calendar, weather, devops)
2. The specific task (e.g., schedule events, check forecast)
3. Whether this is a common enough task that a skill likely exists

### Step 2: Search for Skills
Run the search command with a relevant query (in host shell mode):
```bash
python3 /root/.skillhub/skills_store_cli.py search <keyword>
```

### Step 3: Present Options to the User
Example response:
```
I found skills that might help!

- ws-calendar (v1.0.0): 日程管理。创建日程、设置提醒、查看安排。
- gcalcli-calendar (v3.0.0): Google Calendar via gcalcli

To install: python3 /root/.skillhub/skills_store_cli.py --dir /opt/webos/skills install <slug>
```

### Step 4: Install the Skill
If the user wants to proceed, install for them:
```bash
python3 /root/.skillhub/skills_store_cli.py \
  --dir /opt/webos/skills \
  install ws-calendar
```

Then activate with `activate_skill ws-calendar`.

## Common Skill Categories
| Category | Example Queries |
|----------|-----------------|
| Calendar | calendar, schedule, agenda |
| Communication | email, slack, telegram |
| Development | git, docker, deploy |
| Information | weather, news, search |
| Productivity | todo, notes, reminder |

## Notes

- Install location: `/opt/webos/skills/`
- Index file: `/root/.skillhub/skills_index.local.json`
- CLI location: `/root/.skillhub/skills_store_cli.py`
- Some skills may require external dependencies (e.g., `gcalcli-calendar` needs `gcalcli` installed)
