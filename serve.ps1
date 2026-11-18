# 本地预览用的小服务器：在浏览器打开 http://localhost:8765
param([int]$Port = 8765)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8';
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.svg' = 'image/svg+xml';
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.md' = 'text/plain; charset=utf-8'
}
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
  if ($path -eq '/') { $path = '/index.html' }
  $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
  $res = $ctx.Response
  # 开发用：页面把截图存到 .debug/ 资料夹
  if ($ctx.Request.HttpMethod -eq 'POST' -and $path -match '^/__debug/([A-Za-z0-9_-]+)$') {
    $dir = Join-Path $root '.debug'
    New-Item -ItemType Directory -Force $dir | Out-Null
    $ms = New-Object IO.MemoryStream
    $ctx.Request.InputStream.CopyTo($ms)
    [IO.File]::WriteAllBytes((Join-Path $dir ($Matches[1] + '.png')), $ms.ToArray())
    $res.StatusCode = 204; $res.Close(); continue
  }
  if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
    $ext = [IO.Path]::GetExtension($file).ToLower()
    $res.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' })
    $res.Headers.Add('Cache-Control', 'no-store')
    $bytes = [IO.File]::ReadAllBytes($file)
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
  }
  $res.Close()
}
