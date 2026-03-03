<script setup>
import { ref, shallowRef, onMounted } from 'vue'
import VueOfficeDocx from '@vue-office/docx'
import VueOfficeExcel from '@vue-office/excel'
import VueOfficePdf from '@vue-office/pdf'
import VueOfficePptx from '@vue-office/pptx'

import '@vue-office/docx/lib/index.css'
import '@vue-office/excel/lib/index.css'

const props = defineProps({
  ctx: { type: Object, required: true },
})

const sdk = props.ctx.sdk
const file = props.ctx.file

const fileType = ref('')
const src = shallowRef(null)
const loading = ref(false)
const error = ref('')
const fileName = ref('')

const typeMap = {
  docx: 'docx',
  doc: 'docx',
  xlsx: 'excel',
  xls: 'excel',
  pdf: 'pdf',
  pptx: 'pptx',
  ppt: 'pptx',
}

function getFileExt(filePath) {
  return filePath.split('.').pop().toLowerCase()
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

async function readFileAsArrayBuffer(filePath) {
  const result = await sdk.exec(`base64 -w 0 "${filePath}"`)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || '文件读取失败')
  }
  return base64ToArrayBuffer(result.stdout.trim())
}

async function openFile(filePath) {
  const ext = getFileExt(filePath)
  const type = typeMap[ext]

  if (!type) {
    error.value = `不支持的文件格式: .${ext}，支持 docx/xlsx/pdf/pptx`
    return
  }

  const name = filePath.split('/').pop()
  fileName.value = name
  fileType.value = type
  loading.value = true
  error.value = ''

  sdk.window.setTitle('Office 预览 - ' + name)

  try {
    const buffer = await readFileAsArrayBuffer(filePath)
    src.value = buffer
  } catch (e) {
    loading.value = false
    error.value = '文件读取失败: ' + e.message
    console.error(e)
  }
}

async function pickFile() {
  const path = prompt('请输入文件路径，例如: /home/documents/report.docx')
  if (path) {
    await openFile(path.trim())
  }
}

onMounted(async () => {
  if (file && file.path) {
    await openFile(file.path)
  } else {
    sdk.window.setTitle('Office 文件预览')
  }
})

function onRendered() {
  loading.value = false
}

function onError(e) {
  loading.value = false
  error.value = '文件解析失败，请确认文件格式正确'
  console.error(e)
}
</script>

<template>
  <div class="app">
    <!-- 欢迎页 -->
    <div v-if="!src && !error" class="welcome">
      <div class="welcome-icon">📄</div>
      <h2>Office 文件预览</h2>
      <p>支持 Word (.docx) / Excel (.xlsx) / PDF / PPT (.pptx)</p>
      <div class="actions">
        <button class="btn" @click="pickFile">打开文件</button>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error">
      <p>{{ error }}</p>
      <button class="btn btn-small" @click="pickFile">重新选择</button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading">加载中...</div>

    <!-- 文件预览 -->
    <div v-if="src" class="preview-container">
      <VueOfficeDocx
        v-if="fileType === 'docx'"
        :src="src"
        @rendered="onRendered"
        @error="onError"
      />
      <VueOfficeExcel
        v-if="fileType === 'excel'"
        :src="src"
        @rendered="onRendered"
        @error="onError"
      />
      <VueOfficePdf
        v-if="fileType === 'pdf'"
        :src="src"
        @rendered="onRendered"
        @error="onError"
      />
      <VueOfficePptx
        v-if="fileType === 'pptx'"
        :src="src"
        @rendered="onRendered"
        @error="onError"
      />
    </div>
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #666;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.welcome h2 {
  margin-bottom: 8px;
  color: #333;
}

.welcome p {
  font-size: 14px;
  margin-bottom: 12px;
}

.actions {
  margin-top: 8px;
}

.btn {
  padding: 8px 24px;
  background: #409eff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.btn:hover {
  background: #337ecc;
}

.btn-small {
  padding: 4px 16px;
  font-size: 13px;
  margin-top: 12px;
}

.error {
  color: #f56c6c;
  margin-top: 60px;
  font-size: 14px;
  text-align: center;
}

.loading {
  color: #409eff;
  margin-top: 60px;
  font-size: 14px;
  text-align: center;
}

.preview-container {
  width: 100%;
  flex: 1;
  overflow: auto;
}
</style>
