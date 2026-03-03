import yaml from "js-yaml"

export interface PortMapping {
  host: string
  container: string
  protocol: string
}

export interface VolumeMount {
  type: "bind" | "volume"
  host: string
  container: string
  mode: string
}

export interface EnvVar {
  key: string
  value: string
}

export interface ServiceConfig {
  name: string
  image: string
  containerName: string
  restart: string
  command: string
  ports: PortMapping[]
  volumes: VolumeMount[]
  environment: EnvVar[]
  networks: string[]
  dependsOn: string[]
  collapsed: boolean
  _extra: Record<string, any>
}

export const KNOWN_SERVICE_KEYS = new Set([
  "image", "container_name", "restart", "command",
  "ports", "volumes", "environment", "networks", "depends_on",
])

export function newService(name = ""): ServiceConfig {
  return {
    name, image: "", containerName: "", restart: "unless-stopped", command: "",
    ports: [], volumes: [], environment: [], networks: [], dependsOn: [],
    collapsed: false, _extra: {},
  }
}

export function parseYamlToForm(yamlStr: string): {
  services: ServiceConfig[]
  globalNetworks: string
  globalVolumes: string
  fullDoc: Record<string, any>
} {
  const empty = { services: [newService("web")], globalNetworks: "", globalVolumes: "", fullDoc: {} }
  try {
    const doc = yaml.load(yamlStr) as Record<string, any> | null
    if (!doc || typeof doc !== "object") return empty

    const svcMap = doc.services || {}
    const services: ServiceConfig[] = Object.entries(svcMap).map(([name, def]: [string, any]) => {
      const svc = newService(name)
      if (!def || typeof def !== "object") return svc
      svc.image = def.image || ""
      svc.containerName = def.container_name || ""
      svc.restart = def.restart || "unless-stopped"
      svc.command = typeof def.command === "string" ? def.command : Array.isArray(def.command) ? def.command.join(" ") : ""

      if (Array.isArray(def.ports)) {
        svc.ports = def.ports.map((p: any) => {
          const s = String(p)
          const isUdp = s.endsWith("/udp")
          const clean = isUdp ? s.slice(0, -4) : s.replace(/\/tcp$/, "")
          const parts = clean.split(":")
          return { host: parts.length >= 2 ? parts[parts.length - 2] : "", container: parts[parts.length - 1] || "", protocol: isUdp ? "udp" : "tcp" }
        })
      }

      if (Array.isArray(def.volumes)) {
        svc.volumes = def.volumes.map((v: any) => {
          const s = String(v)
          const parts = s.split(":")
          const isBindPath = (p: string) => p.startsWith("/") || p.startsWith("./") || p.startsWith("../") || p.startsWith("~")
          if (parts.length >= 3 && (parts[parts.length - 1] === "ro" || parts[parts.length - 1] === "rw")) {
            const src = parts.slice(0, -2).join(":")
            return { type: isBindPath(src) ? "bind" as const : "volume" as const, host: src, container: parts[parts.length - 2], mode: parts[parts.length - 1] }
          }
          if (parts.length >= 2) {
            return { type: isBindPath(parts[0]) ? "bind" as const : "volume" as const, host: parts[0], container: parts.slice(1).join(":"), mode: "rw" }
          }
          return { type: "bind" as const, host: s, container: "", mode: "rw" }
        })
      }

      if (def.environment) {
        if (Array.isArray(def.environment)) {
          svc.environment = def.environment.map((e: any) => {
            const s = String(e)
            const idx = s.indexOf("=")
            return idx >= 0 ? { key: s.slice(0, idx), value: s.slice(idx + 1) } : { key: s, value: "" }
          })
        } else if (typeof def.environment === "object") {
          svc.environment = Object.entries(def.environment).map(([key, value]) => ({ key, value: String(value ?? "") }))
        }
      }

      if (Array.isArray(def.networks)) svc.networks = def.networks.map(String)
      if (Array.isArray(def.depends_on)) svc.dependsOn = def.depends_on.map(String)

      const extra: Record<string, any> = {}
      for (const key of Object.keys(def)) { if (!KNOWN_SERVICE_KEYS.has(key)) extra[key] = def[key] }
      svc._extra = extra

      return svc
    })

    const globalNetworks = doc.networks ? Object.keys(doc.networks).join(", ") : ""
    const globalVolumes = doc.volumes ? Object.keys(doc.volumes).join(", ") : ""

    return { services: services.length > 0 ? services : [newService("web")], globalNetworks, globalVolumes, fullDoc: doc }
  } catch {
    return empty
  }
}

export function buildDocFromForm(
  services: ServiceConfig[],
  globalNetworks: string,
  globalVolumes: string,
  fullDoc: Record<string, any>,
): Record<string, any> {
  const doc = { ...fullDoc }
  const svcMap: Record<string, any> = {}

  for (const svc of services) {
    if (!svc.name) continue
    const base = (fullDoc.services && fullDoc.services[svc.name]) || {}
    const def: Record<string, any> = { ...base, ...svc._extra }

    if (svc.image) def.image = svc.image; else delete def.image
    if (svc.containerName) def.container_name = svc.containerName; else delete def.container_name
    if (svc.restart) def.restart = svc.restart; else delete def.restart
    if (svc.command) def.command = svc.command; else delete def.command

    if (svc.ports.length > 0) {
      const ports = svc.ports.filter((p) => p.host && p.container)
        .map((p) => (p.protocol === "udp" ? `${p.host}:${p.container}/udp` : `${p.host}:${p.container}`))
      if (ports.length > 0) def.ports = ports; else delete def.ports
    } else { delete def.ports }

    if (svc.volumes.length > 0) {
      const vols = svc.volumes.filter((v) => v.host && v.container)
        .map((v) => (v.mode === "ro" ? `${v.host}:${v.container}:ro` : `${v.host}:${v.container}`))
      if (vols.length > 0) def.volumes = vols; else delete def.volumes
    } else { delete def.volumes }

    if (svc.environment.length > 0) {
      const env: Record<string, string> = {}
      svc.environment.filter((e) => e.key).forEach((e) => (env[e.key] = e.value))
      if (Object.keys(env).length > 0) def.environment = env; else delete def.environment
    } else { delete def.environment }

    if (svc.networks.length > 0) def.networks = svc.networks; else delete def.networks
    if (svc.dependsOn.length > 0) def.depends_on = svc.dependsOn; else delete def.depends_on

    svcMap[svc.name] = def
  }

  doc.services = svcMap

  if (globalNetworks.trim()) {
    const nets: Record<string, any> = {}
    globalNetworks.split(",").map((n) => n.trim()).filter(Boolean)
      .forEach((n) => { nets[n] = (fullDoc.networks && fullDoc.networks[n]) || (n === "webos-network" ? { external: true } : { driver: "bridge" }) })
    if (Object.keys(nets).length > 0) doc.networks = nets; else delete doc.networks
  } else { delete doc.networks }

  if (globalVolumes.trim()) {
    const vols: Record<string, any> = {}
    globalVolumes.split(",").map((v) => v.trim()).filter(Boolean)
      .forEach((v) => { vols[v] = (fullDoc.volumes && fullDoc.volumes[v]) || null })
    // also collect named volumes from services
    for (const svc of services) {
      for (const v of svc.volumes) {
        if (v.type === "volume" && v.host && !vols[v.host]) {
          vols[v.host] = null
        }
      }
    }
    if (Object.keys(vols).length > 0) doc.volumes = vols; else delete doc.volumes
  } else {
    // even without global volumes text, collect named volumes from services
    const vols: Record<string, any> = {}
    for (const svc of services) {
      for (const v of svc.volumes) {
        if (v.type === "volume" && v.host) {
          vols[v.host] = (fullDoc.volumes && fullDoc.volumes[v.host]) || null
        }
      }
    }
    if (Object.keys(vols).length > 0) doc.volumes = vols; else delete doc.volumes
  }

  return doc
}
