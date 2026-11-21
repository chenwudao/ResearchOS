import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const DEFAULT_TITLE = '选择文件夹'

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env ? { ...process.env, ...env } : process.env,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

function resolveOnPath(names) {
  const pathValue = process.env.PATH || ''
  const delimiter = process.platform === 'win32' ? ';' : ':'
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE').split(';') : ['']
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue
    for (const name of names) {
      for (const ext of extensions) {
        const file = (!ext || name.toLowerCase().endsWith(ext.toLowerCase())) ? name : name + ext
        const candidate = join(dir, file)
        if (existsSync(candidate)) return candidate
      }
    }
  }
  return ''
}

const WINDOWS_PICKER = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$title = $env:LABWEAVE_PICK_TITLE
if (-not $title) { $title = '选择文件夹' }

function Pick-Vista([string]$Title) {
  $code = @"
using System;
using System.Runtime.InteropServices;

public static class LabWeaveFolderPicker {
  [ComImport]
  [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
  private class FileOpenDialog { }

  [ComImport]
  [Guid("42f85136-db7e-439c-85f1-e4075d135fc8")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint fos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace(IShellItem psi, uint fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
  }

  [ComImport]
  [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, out IntPtr ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
  }

  private const uint FOS_PICKFOLDERS = 0x00000020;
  private const uint FOS_FORCEFILESYSTEM = 0x00000040;
  private const uint SIGDN_FILESYSPATH = 0x80058000;

  public static string Select(string title) {
    var dialog = (IFileDialog)new FileOpenDialog();
    uint options;
    dialog.GetOptions(out options);
    dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM);
    if (!string.IsNullOrEmpty(title)) dialog.SetTitle(title);
    int hr = dialog.Show(IntPtr.Zero);
    if (hr != 0) return string.Empty;
    IShellItem item;
    dialog.GetResult(out item);
    IntPtr psz;
    item.GetDisplayName(SIGDN_FILESYSPATH, out psz);
    string path = Marshal.PtrToStringUni(psz);
    Marshal.FreeCoTaskMem(psz);
    return path ?? string.Empty;
  }
}
"@
  Add-Type -TypeDefinition $code -ErrorAction Stop
  return [LabWeaveFolderPicker]::Select($Title)
}

function Pick-Legacy([string]$Title) {
  Add-Type -AssemblyName System.Windows.Forms
  $form = New-Object System.Windows.Forms.Form
  $form.TopMost = $true
  $form.ShowInTaskbar = $false
  $form.FormBorderStyle = 'FixedToolWindow'
  $form.StartPosition = 'CenterScreen'
  $form.Size = New-Object System.Drawing.Size(0, 0)
  $form.Show()
  $form.Activate()
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = $Title
  $dialog.ShowNewFolderButton = $true
  $result = $dialog.ShowDialog($form)
  $form.Close()
  if ($result -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.SelectedPath }
  return ''
}

$path = ''
try { $path = Pick-Vista $title } catch { $path = Pick-Legacy $title }
if ($path) { [Console]::Out.Write($path) }
exit 0
`

async function pickWindows(title) {
  const dir = await mkdtemp(join(tmpdir(), 'lw-pick-'))
  const script = join(dir, 'pick.ps1')
  try {
    await writeFile(script, `\uFEFF${WINDOWS_PICKER}`, 'utf8')
    const exe = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const { code, stdout, stderr } = await run(exe, [
      '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script,
    ], { LABWEAVE_PICK_TITLE: title })
    const picked = stdout.replace(/^\uFEFF/, '').trim()
    if (picked) return picked
    if (code === 0) return ''
    throw new Error(stderr.trim() || '无法打开目录选择器。')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function pickMac(title) {
  const escaped = JSON.stringify(title)
  const script = `try\nPOSIX path of (choose folder with prompt ${escaped})\non error\nreturn ""\nend try`
  const { code, stdout, stderr } = await run('osascript', ['-e', script])
  if (code !== 0) throw new Error(stderr.trim() || '无法打开目录选择器。')
  return stdout.trim()
}

async function pickLinux(title) {
  const zenity = resolveOnPath(['zenity'])
  if (zenity) {
    const { code, stdout, stderr } = await run(zenity, ['--file-selection', '--directory', `--title=${title}`])
    if (code === 0) return stdout.trim()
    if (code === 1) return ''
    throw new Error(stderr.trim() || '无法打开目录选择器。')
  }
  const kdialog = resolveOnPath(['kdialog'])
  if (kdialog) {
    const { code, stdout, stderr } = await run(kdialog, ['--getexistingdirectory', process.env.HOME || '.', title])
    if (code === 0) return stdout.trim()
    if (code === 1) return ''
    throw new Error(stderr.trim() || '无法打开目录选择器。')
  }
  throw new Error('无法打开目录选择器。')
}

export async function pickDirectory(title = DEFAULT_TITLE) {
  if (process.platform === 'win32') return pickWindows(title)
  if (process.platform === 'darwin') return pickMac(title)
  return pickLinux(title)
}
