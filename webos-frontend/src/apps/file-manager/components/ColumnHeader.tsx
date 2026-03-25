import { useTranslation } from 'react-i18next'
import { SortIcon } from "./useFileSort"
import type { SortField, SortDirection } from "./types"

interface ColumnHeaderProps {
  sortField: SortField
  sortDirection: SortDirection
  onSortClick: (field: SortField) => void
}

export function ColumnHeader({ sortField, sortDirection, onSortClick }: ColumnHeaderProps) {
  const { t } = useTranslation()
  return (
    <div className="sticky top-0 z-10 -mx-3 mb-2">
      <div className="flex items-center justify-between px-6 py-1.5 bg-white/5 border-b border-white/10 text-xs font-medium text-slate-600 select-none min-w-[36rem]">
        <div className="flex items-center gap-1 cursor-pointer hover:text-slate-900 transition-colors"
          onClick={() => onSortClick("name")}>
          <span>{t('apps.fileManager.columns.name')}</span>
          <SortIcon field="name" sortField={sortField} sortDirection={sortDirection} />
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1 w-24 justify-end cursor-pointer hover:text-slate-900 transition-colors"
            onClick={() => onSortClick("extension")}>
            <span>{t('apps.fileManager.columns.kind')}</span>
            <SortIcon field="extension" sortField={sortField} sortDirection={sortDirection} />
          </div>
          <div className="flex items-center gap-1 w-16 justify-end cursor-pointer hover:text-slate-900 transition-colors"
            onClick={() => onSortClick("size")}>
            <span>{t('apps.fileManager.columns.size')}</span>
            <SortIcon field="size" sortField={sortField} sortDirection={sortDirection} />
          </div>
          <div className="flex items-center gap-1 w-32 justify-end cursor-pointer hover:text-slate-900 transition-colors"
            onClick={() => onSortClick("modifiedTime")}>
            <span>{t('apps.fileManager.columns.modifiedTime')}</span>
            <SortIcon field="modifiedTime" sortField={sortField} sortDirection={sortDirection} />
          </div>
        </div>
      </div>
    </div>
  )
}
