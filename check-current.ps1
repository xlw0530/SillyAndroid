Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Fixing MainApplication.java" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$mainAppPath = "android\app\src\main\java\com\sillyandroid\MainApplication.java"

# 1. 备份
$backupPath = "$mainAppPath.backup"
Copy-Item $mainAppPath $backupPath -Force
Write-Host "[OK] Backup created: $backupPath" -ForegroundColor Green

# 2. 读取文件
$lines = Get-Content $mainAppPath

# 3. 修改内容
$newLines = @()
$importAdded = $false
$packageAdded = $false

foreach ($line in $lines) {
    # 在最后一个 import 后添加 nodejs-mobile import
    if ($line -match "^import java\.util\.List;" -and -not $importAdded) {
        $newLines += $line
        $newLines += "import com.janeasystems.rn_nodejs_mobile.RNNodeJsMobilePackage;"
        $importAdded = $true
        Write-Host "[OK] Added import statement" -ForegroundColor Green
    }
    # 在 return packages; 之前添加 package
    elseif ($line -match "^\s*return packages;" -and -not $packageAdded) {
        $newLines += "          packages.add(new RNNodeJsMobilePackage());"
        $newLines += $line
        $packageAdded = $true
        Write-Host "[OK] Added package to list" -ForegroundColor Green
    }
    else {
        $newLines += $line
    }
}

# 4. 保存
Set-Content $mainAppPath $newLines -Encoding UTF8

# 5. 验证
Write-Host ""
Write-Host "Verification:" -ForegroundColor Yellow
$content = Get-Content $mainAppPath -Raw

if ($content -match "import com\.janeasystems\.rn_nodejs_mobile\.RNNodeJsMobilePackage") {
    Write-Host "[OK] Import verified" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Import not found!" -ForegroundColor Red
}

if ($content -match "new RNNodeJsMobilePackage\(\)") {
    Write-Host "[OK] Package addition verified" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Package not added!" -ForegroundColor Red
}

Write-Host ""
Write-Host "Lines count:" -ForegroundColor Yellow
Write-Host "Before: 62" -ForegroundColor Gray
Write-Host "After: $((Get-Content $mainAppPath).Count)" -ForegroundColor Gray

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next step: Run build!" -ForegroundColor Yellow
Write-Host "npx react-native run-android" -ForegroundColor White
