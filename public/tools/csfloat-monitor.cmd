<# :
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex (Get-Content '%~f0' | Out-String)"
exit /b
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# 1. Check for 'lcp' command
if (-not (Get-Command "lcp" -ErrorAction SilentlyContinue)) {
    [System.Windows.Forms.MessageBox]::Show("Error: 'lcp' command not found.`nPlease run: npm install -g local-cors-proxy", "CSFloat Monitor Error")
    exit
}

# 2. Start the proxy in the background (Hidden)
# We use cmd.exe /c to ensure the npm .cmd shim is found correctly
$proxyProc = Start-Process "cmd.exe" -ArgumentList "/c lcp --proxyUrl https://csfloat.com" -WindowStyle Hidden -PassThru

# 3. Open the browser
Start-Process "https://rgo.pt/tools/csfloat-monitor"

# 4. Create the Tray Icon
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Text = "CSFloat Proxy (Running)`nLeft-click to open Monitor"
$notifyIcon.Visible = $true
$notifyIcon.Icon = [System.Drawing.SystemIcons]::Application

# -- Left Click: Open URL --
$notifyIcon.add_MouseClick({
    param($sender, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        Start-Process "https://rgo.pt/tools/csfloat-monitor"
    }
})

# -- Right Click: Exit Menu --
$contextMenu = New-Object System.Windows.Forms.ContextMenu
$exitMenuItem = New-Object System.Windows.Forms.MenuItem
$exitMenuItem.Text = "Exit Proxy"

$exitMenuItem.add_Click({
    if ($proxyProc -and -not $proxyProc.HasExited) {
        Stop-Process -Id $proxyProc.Id -Force
    }
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$contextMenu.MenuItems.Add($exitMenuItem)
$notifyIcon.ContextMenu = $contextMenu

$notifyIcon.ShowBalloonTip(3000, "CSFloat Monitor", "Proxy started.`nLeft-click icon to reopen site.", [System.Windows.Forms.ToolTipIcon]::Info)

# Keep the script running to maintain the icon
[System.Windows.Forms.Application]::Run()
