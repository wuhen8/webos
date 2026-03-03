import { lazy, Suspense, type ComponentType } from 'react'

function LoadingFallback() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-gray-600" />
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyLoad(factory: () => Promise<{ default: ComponentType<any> }>) {
  const LazyComp = lazy(factory)
  function LazyWrapper(props: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return (
      <Suspense fallback={<LoadingFallback />}>
        <LazyComp {...props} />
      </Suspense>
    )
  }
  return LazyWrapper
}
