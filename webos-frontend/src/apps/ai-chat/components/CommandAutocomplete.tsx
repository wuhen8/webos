import type { CommandDef } from './types'

export function CommandAutocomplete({ commands, filter, onSelect, selectedIndex }: {
  commands: CommandDef[]
  filter: string
  onSelect: (cmd: CommandDef) => void
  selectedIndex: number
}) {
  const query = filter.slice(1).toLowerCase()
  const filtered = commands.filter(c =>
    c.Name.includes(query) ||
    (c.Aliases || []).some(a => a.includes(query)) ||
    c.Description.includes(query)
  )

  if (filtered.length === 0) return null

  // Dynamically derive categories from the commands themselves
  const catMap = new Map<string, { label: string; order: number; cmds: CommandDef[] }>()
  for (const cmd of filtered) {
    const cat = cmd.Category || 'system'
    if (!catMap.has(cat)) {
      catMap.set(cat, {
        label: cmd.CategoryLabel || cat,
        order: cmd.CategoryOrder ?? 99,
        cmds: [],
      })
    }
    catMap.get(cat)!.cmds.push(cmd)
  }

  const sortedCats = [...catMap.entries()].sort((a, b) => a[1].order - b[1].order)

  let flatIndex = 0

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-20 max-h-72 overflow-auto">
      {sortedCats.map(([cat, { label, cmds }]) => (
        <div key={cat}>
          <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            {label}
          </div>
          {cmds.map(cmd => {
            const idx = flatIndex++
            return (
              <button
                key={cmd.Name}
                className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 transition-colors ${
                  idx === selectedIndex ? 'bg-violet-50' : 'hover:bg-slate-50'
                }`}
                onMouseDown={e => { e.preventDefault(); onSelect(cmd) }}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono text-sm font-semibold ${idx === selectedIndex ? 'text-violet-600' : 'text-slate-700'}`}>
                    /{cmd.Name}
                  </span>
                  {cmd.Args && (
                    <span className="text-xs text-slate-400 font-mono">{cmd.Args}</span>
                  )}
                  {(cmd.Aliases || []).length > 0 && (
                    <span className="text-[10px] text-slate-300 ml-1">
                      {cmd.Aliases.map(a => '/' + a).join(', ')}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 leading-snug">{cmd.Description}</div>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
