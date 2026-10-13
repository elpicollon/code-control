export const toPosix = (path: string): string => {
  const slashed = path.replace(/\\/g, '/')
  return slashed.length > 1 ? slashed.replace(/\/+$/, '') : slashed
}

export const join = (...parts: readonly string[]): string =>
  toPosix(parts.filter(part => part !== '').join('/').replace(/\/{2,}/g, '/'))

export const basename = (path: string): string => toPosix(path).split('/').pop() ?? path

export const dirname = (path: string): string => {
  const posix = toPosix(path)
  const at = posix.lastIndexOf('/')
  return at <= 0 ? '' : posix.slice(0, at)
}

export const isWindowsPath = (path: string): boolean => /^[A-Za-z]:\//.test(toPosix(path))

// `uname -s` as Git for Windows' shells answer it, or 'Windows' when there is no uname.
export const isWindowsPlatform = (platform: string): boolean => /windows|mingw|msys|cygwin/i.test(platform)

// Opening one of these in its default program would run it (`open` runs .command and extensionless
// executables; `explorer` runs .bat, .js, .vbs, .lnk…), so the file is only revealed.
const RUNNABLE = new Set(
  'sh bash zsh fish command tool app exe com bat cmd ps1 psm1 vbs vbe js jse wsf wsh msi msc lnk scr jar py pyw rb pl php cgi run bin out appimage desktop'.split(' '),
)

export const isRunnable = (path: string): boolean => {
  const name = basename(path)
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return true
  return RUNNABLE.has(name.slice(dot + 1).toLowerCase())
}

export const openArgv = (platform: string, path: string): string[] => {
  const reveal = isRunnable(path)
  if (isWindowsPath(path) || isWindowsPlatform(platform)) {
    const windows = toPosix(path).replace(/\//g, '\\')
    return ['explorer', reveal ? `/select,${windows}` : windows]
  }
  if (platform === 'Darwin') return reveal ? ['open', '-R', path] : ['open', path]
  return ['xdg-open', reveal ? dirname(path) || '/' : path]
}
