// 测试小组件是否加载
console.log('[Test] Widget store:', window.__WIDGET_STORE__)
setTimeout(() => {
  const widgets = JSON.parse(localStorage.getItem('widgets:instances') || '[]')
  console.log('[Test] Widgets in localStorage:', widgets)
}, 1000)
