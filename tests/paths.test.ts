import { test, expect } from 'claude-code/testing'
import { basename, dirname, isRunnable, join, openArgv, toPosix } from '../hooks/paths'

test('normalizes Windows and trailing slashes', () => {
  expect(toPosix('C:\\dev\\work\\repo\\')).toBe('C:/dev/work/repo')
  expect(toPosix('/')).toBe('/')
  expect(join('/w/', 'apps', 'web')).toBe('/w/apps/web')
  expect(join('C:/w', 'app')).toBe('C:/w/app')
})

test('basename and dirname of repository paths', () => {
  expect(basename('/w/Docs/docs-site')).toBe('docs-site')
  expect(dirname('src/components/grid.html')).toBe('src/components')
  expect(dirname('CHANGELOG.md')).toBe('')
})

test('opens files with the platform tool', () => {
  expect(openArgv('Darwin', '/w/a b.txt')).toEqual(['open', '/w/a b.txt'])
  expect(openArgv('Linux', '/w/a.txt')).toEqual(['xdg-open', '/w/a.txt'])
  expect(openArgv('Windows', 'C:/w/a.txt')).toEqual(['explorer', 'C:\\w\\a.txt'])
  expect(openArgv('MINGW64_NT-10.0', 'C:/w/a.txt')).toEqual(['explorer', 'C:\\w\\a.txt'])
})

test('files with no extension or a script or executable extension count as runnable', () => {
  for (const path of ['/w/run', '/w/.env', '/w/Makefile', '/w/x.', '/w/deploy.SH', '/w/start.command', 'C:/w/Setup.EXE', '/w/tool.js', '/w/main.py', '/w/App.app', '/w/a.AppImage', '/w/x.desktop']) {
    expect(isRunnable(path)).toBe(true)
  }
  for (const path of ['/w/a.txt', '/w/src/app.ts', '/w/archive.tar.gz', '/w/README.md', '/w/my.dir/photo.PNG']) {
    expect(isRunnable(path)).toBe(false)
  }
})

test('runnable files are only revealed, never opened', () => {
  expect(openArgv('Darwin', '/w/build.sh')).toEqual(['open', '-R', '/w/build.sh'])
  expect(openArgv('Darwin', '/w/Makefile')).toEqual(['open', '-R', '/w/Makefile'])
  expect(openArgv('Linux', '/w/tools/run.sh')).toEqual(['xdg-open', '/w/tools'])
  expect(openArgv('Linux', '/w/tools/run')).toEqual(['xdg-open', '/w/tools'])
  expect(openArgv('Linux', '/run.sh')).toEqual(['xdg-open', '/'])
  expect(openArgv('Windows', 'C:/w/a b/setup.bat')).toEqual(['explorer', '/select,C:\\w\\a b\\setup.bat'])
  expect(openArgv('MINGW64_NT-10.0', 'C:/w/tool.vbs')).toEqual(['explorer', '/select,C:\\w\\tool.vbs'])
  expect(openArgv('Darwin', 'C:/w/LICENSE')).toEqual(['explorer', '/select,C:\\w\\LICENSE'])
})
