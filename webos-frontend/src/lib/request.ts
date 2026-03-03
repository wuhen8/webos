import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { getApiBase } from '@/lib/env'

const TOKEN_KEY = 'fm_token'

// 统一响应结构
export interface ApiResponse<T = any> {
  code: number
  data: T
  message: string
}

// 创建 axios 实例
const request: AxiosInstance = axios.create({
  baseURL: getApiBase(),
  timeout: 300000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器 - 自动添加 JWT token
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 处理统一响应格式和 token 过期
request.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    // 检查业务状态码
    const { code, message } = response.data
    if (code !== 0) {
      // 业务错误
      return Promise.reject(new Error(message || 'Request failed'))
    }
    return response
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response
      if (status === 401) {
        // token 过期或无效，清除 token
        localStorage.removeItem(TOKEN_KEY)
        // 可以在这里触发重新登录
        window.dispatchEvent(new CustomEvent('auth:unauthorized'))
      }
      // 返回服务端错误信息
      if (data?.message) {
        return Promise.reject(new Error(data.message))
      }
    }
    return Promise.reject(error)
  }
)

// Token 管理工具函数
export const setToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token)
}

export const getToken = () => {
  return localStorage.getItem(TOKEN_KEY)
}

export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY)
}

export const hasToken = () => {
  return !!localStorage.getItem(TOKEN_KEY)
}

export default request
