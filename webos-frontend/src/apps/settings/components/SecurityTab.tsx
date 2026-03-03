import { useState } from "react"
import request from "@/lib/request"
import { SettingsIcon } from "./SettingsIcon"

export default function SecurityTab() {
  const [newPassword, setNewPassword] = useState("")

  const savePassword = async () => {
    if (newPassword.trim() === "") return
    try {
      await request.put(`/password`, { password: newPassword })
      setNewPassword("")
    } catch {}
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col items-center mb-8 pt-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-500 flex items-center justify-center shadow-lg mb-3">
          <SettingsIcon type="security" className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">隐私与安全性</h1>
        <p className="text-[0.8125rem] text-gray-500 mt-1 text-center">管理服务配置和安全设置</p>
      </div>

      <div className="bg-[#f5f5f7] rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-[0.8125rem] text-gray-900">锁屏密码</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="输入新密码"
            className="w-28 h-7 px-2 text-[0.8125rem] bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={savePassword}
          className="w-full py-2 text-[0.8125rem] bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
        >
          修改密码
        </button>
      </div>
    </div>
  )
}
