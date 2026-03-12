import { useState, useEffect } from "react"
import { Settings, Plus, Trash2 } from "lucide-react"
import { addStorageNode, updateStorageNode, deleteStorageNode } from "@/lib/storageApi"
import type { StorageNodeConfig } from "@/types"
import { SettingsIcon } from "./SettingsIcon"
import { useWebSocketStore } from "@/stores"

export default function StorageTab() {
  const [storageNodes, setStorageNodes] = useState<StorageNodeConfig[]>([])
  const [storageLoading, setStorageLoading] = useState(true)
  const subscribe = useWebSocketStore((s) => s.subscribe)
  const [storageShowAdd, setStorageShowAdd] = useState(false)
  const [storageEditId, setStorageEditId] = useState<string | null>(null)
  const [storageForm, setStorageForm] = useState({
    name: "",
    type: "s3" as "local" | "s3",
    endpoint: "",
    bucket: "",
    region: "",
    accessKey: "",
    secretKey: "",
    useSSL: true,
    path: "",
    externalHost: "",
  })

  const resetStorageForm = () => {
    setStorageForm({ name: "", type: "s3", endpoint: "", bucket: "", region: "", accessKey: "", secretKey: "", useSSL: true, path: "", externalHost: "" })
    setStorageEditId(null)
    setStorageShowAdd(false)
  }

  // Subscribe to storage nodes — initial push + live updates
  useEffect(() => {
    return subscribe("sub.storage_nodes", 0, (data: any) => {
      if (Array.isArray(data)) {
        setStorageNodes(data)
        setStorageLoading(false)
      }
    })
  }, [subscribe])

  const handleSaveStorageNode = async () => {
    const config: Record<string, any> = storageForm.type === "s3"
      ? { endpoint: storageForm.endpoint, bucket: storageForm.bucket, region: storageForm.region, accessKey: storageForm.accessKey, secretKey: storageForm.secretKey, useSSL: storageForm.useSSL, externalHost: storageForm.externalHost }
      : { externalHost: storageForm.externalHost }

    const node: Omit<StorageNodeConfig, 'id'> & { id?: string } = {
      name: storageForm.name,
      type: storageForm.type,
      config,
    }

    try {
      if (storageEditId) {
        await updateStorageNode(storageEditId, node)
      } else {
        await addStorageNode(node)
      }
      resetStorageForm()
    } catch {}
  }

  const handleDeleteStorageNode = async (id: string) => {
    try {
      await deleteStorageNode(id)
    } catch {}
  }

  const handleEditStorageNode = (node: StorageNodeConfig) => {
    setStorageEditId(node.id)
    setStorageForm({
      name: node.name,
      type: node.type as "local" | "s3",
      endpoint: node.config?.endpoint || "",
      bucket: node.config?.bucket || "",
      region: node.config?.region || "",
      accessKey: node.config?.accessKey || "",
      secretKey: node.config?.secretKey || "",
      useSSL: node.config?.useSSL !== false,
      path: node.config?.path || "",
      externalHost: node.config?.externalHost || "",
    })
    setStorageShowAdd(true)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">存储节点</h2>
      <p className="text-[0.8125rem] text-gray-500 mb-6">管理本地和 S3 兼容的对象存储节点</p>

      {/* 节点列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 overflow-hidden mb-4">
        {storageLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : storageNodes.length === 0 ? (
          <div className="text-center py-8 text-[0.8125rem] text-gray-400">暂无存储节点</div>
        ) : (
          storageNodes.map((node, idx) => (
            <div key={node.id} className={`flex items-center px-4 py-3 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 ${node.type === 's3' ? 'bg-sky-100' : 'bg-gray-100'}`}>
                <SettingsIcon type="storage" className={`w-4 h-4 ${node.type === 's3' ? 'text-sky-600' : 'text-gray-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[0.8125rem] font-medium text-gray-900 truncate">{node.name}</div>
                <div className="text-[0.6875rem] text-gray-400">
                  {node.type === 's3' ? `S3 · ${node.config?.endpoint || ''} / ${node.config?.bucket || ''}` : `本地存储`}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => handleEditStorageNode(node)}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                {node.id !== 'local_1' && (
                  <button
                    onClick={() => handleDeleteStorageNode(node.id)}
                    className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 添加/编辑表单 */}
      {storageShowAdd ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200/60 p-4 mb-4">
          <h3 className="text-[0.875rem] font-medium text-gray-900 mb-3">{storageEditId ? '编辑节点' : '添加节点'}</h3>
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setStorageForm(f => ({ ...f, type: 'local' }))}
                className={`flex-1 py-2 rounded-lg text-[0.8125rem] font-medium border ${storageForm.type === 'local' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                本地存储
              </button>
              <button
                onClick={() => setStorageForm(f => ({ ...f, type: 's3' }))}
                className={`flex-1 py-2 rounded-lg text-[0.8125rem] font-medium border ${storageForm.type === 's3' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                S3 对象存储
              </button>
            </div>

            <div>
              <label className="block text-[0.75rem] text-gray-500 mb-1">名称</label>
              <input
                value={storageForm.name}
                onChange={e => setStorageForm(f => ({ ...f, name: e.target.value }))}
                placeholder="显示名称"
                className="w-full h-8 px-3 rounded-lg border border-gray-200 text-[0.8125rem] focus:outline-none focus:ring-1 focus:ring-blue-500/40"
              />
            </div>

            {storageForm.type === 's3' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[0.75rem] text-gray-500 mb-1">Endpoint</label>
                    <input
                      value={storageForm.endpoint}
                      onChange={e => setStorageForm(f => ({ ...f, endpoint: e.target.value }))}
                      placeholder="s3.amazonaws.com"
                      className="w-full h-8 px-3 rounded-lg border border-gray-200 text-[0.8125rem] focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.75rem] text-gray-500 mb-1">Bucket</label>
                    <input
                      value={storageForm.bucket}
                      onChange={e => setStorageForm(f => ({ ...f, bucket: e.target.value }))}
                      placeholder="my-bucket"
                      className="w-full h-8 px-3 rounded-lg border border-gray-200 text-[0.8125rem] focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[0.75rem] text-gray-500 mb-1">Region</label>
                  <input
                    value={storageForm.region}
                    onChange={e => setStorageForm(f => ({ ...f, region: e.target.value }))}
                    placeholder="us-east-1"
                    className="w-full h-8 px-3 rounded-lg border border-gray-200 text-[0.8125rem] focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[0.75rem] text-gray-500 mb-1">Access Key</label>
                    <input
                      value={storageForm.accessKey}
                      onChange={e => setStorageForm(f => ({ ...f, accessKey: e.target.value }))}
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                      className="w-full h-8 px-3 rounded-lg border border-gray-200 text-[0.8125rem] focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.75rem] text-gray-500 mb-1">Secret Key</label>
                    <input
                      type="password"
                      value={storageForm.secretKey}
                      onChange={e => setStorageForm(f => ({ ...f, secretKey: e.target.value }))}
                      placeholder="••••••••"
                      className="w-full h-8 px-3 rounded-lg border border-gray-200 text-[0.8125rem] focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={storageForm.useSSL}
                    onChange={e => setStorageForm(f => ({ ...f, useSSL: e.target.checked }))}
                    className="rounded"
                  />
                  <label className="text-[0.8125rem] text-gray-600">使用 SSL</label>
                </div>
              </>
            ) : null}

            <div>
              <label className="block text-[0.75rem] text-gray-500 mb-1">外部访问地址</label>
              <input
                value={storageForm.externalHost}
                onChange={e => setStorageForm(f => ({ ...f, externalHost: e.target.value }))}
                placeholder="https://files.example.com"
                className="w-full h-8 px-3 rounded-lg border border-gray-200 text-[0.8125rem] focus:outline-none focus:ring-1 focus:ring-blue-500/40"
              />
              <p className="text-[0.6875rem] text-gray-400 mt-1">用于生成分享链接和 Office 在线预览</p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={resetStorageForm}
                className="px-4 py-1.5 rounded-lg text-[0.8125rem] text-gray-600 hover:bg-gray-100"
              >
                取消
              </button>
              <button
                onClick={handleSaveStorageNode}
                disabled={!storageForm.name}
                className="px-4 py-1.5 rounded-lg text-[0.8125rem] font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {storageEditId ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { resetStorageForm(); setStorageShowAdd(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[0.8125rem] font-medium text-blue-600 hover:bg-blue-50 border border-blue-200"
        >
          <Plus className="w-4 h-4" />
          添加存储节点
        </button>
      )}
    </div>
  )
}
