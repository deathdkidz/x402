# Redis Setup Script for Windows
# This script helps you set up Redis for local development

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "x402 Facilitator - Redis Setup" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if Redis is already installed
$redisRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:6379" -ErrorAction SilentlyContinue
    $redisRunning = $true
} catch {
    # Redis not responding
}

if ($redisRunning) {
    Write-Host "✅ Redis is already running on port 6379" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your facilitator is ready to use Redis!" -ForegroundColor Green
    exit 0
}

Write-Host "Redis is not running. Choose an option:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Use Docker (Recommended)" -ForegroundColor White
Write-Host "2. Install Redis locally via Chocolatey" -ForegroundColor White
Write-Host "3. Skip (run without Redis cache)" -ForegroundColor White
Write-Host ""
$choice = Read-Host "Enter your choice (1-3)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "Starting Redis with Docker..." -ForegroundColor Cyan
        
        # Check if Docker is available
        try {
            docker --version | Out-Null
            Write-Host "✅ Docker detected" -ForegroundColor Green
            
            # Start Redis container
            Write-Host "Starting Redis container..." -ForegroundColor Cyan
            docker run -d --name x402-redis -p 6379:6379 redis:7-alpine redis-server --appendonly yes
            
            Start-Sleep -Seconds 3
            
            Write-Host ""
            Write-Host "✅ Redis container started successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Useful commands:" -ForegroundColor Yellow
            Write-Host "  Stop Redis:    docker stop x402-redis" -ForegroundColor White
            Write-Host "  Start Redis:   docker start x402-redis" -ForegroundColor White
            Write-Host "  Remove Redis:  docker rm -f x402-redis" -ForegroundColor White
            
        } catch {
            Write-Host "❌ Docker is not installed or not running" -ForegroundColor Red
            Write-Host "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
            exit 1
        }
    }
    
    "2" {
        Write-Host ""
        Write-Host "Installing Redis via Chocolatey..." -ForegroundColor Cyan
        
        # Check if Chocolatey is installed
        try {
            choco --version | Out-Null
            Write-Host "✅ Chocolatey detected" -ForegroundColor Green
            
            Write-Host "Installing Redis..." -ForegroundColor Cyan
            choco install redis-64 -y
            
            Write-Host ""
            Write-Host "Starting Redis service..." -ForegroundColor Cyan
            redis-server --service-start
            
            Write-Host ""
            Write-Host "✅ Redis installed and started!" -ForegroundColor Green
            
        } catch {
            Write-Host "❌ Chocolatey is not installed" -ForegroundColor Red
            Write-Host "Please install Chocolatey from: https://chocolatey.org/install" -ForegroundColor Yellow
            Write-Host "Or choose option 1 (Docker) instead" -ForegroundColor Yellow
            exit 1
        }
    }
    
    "3" {
        Write-Host ""
        Write-Host "⚠️  Running without Redis cache" -ForegroundColor Yellow
        Write-Host "The facilitator will work but without performance benefits:" -ForegroundColor Yellow
        Write-Host "  - All nonce checks will query the blockchain" -ForegroundColor White
        Write-Host "  - All auth requests will query the database" -ForegroundColor White
        Write-Host ""
        Write-Host "You can set up Redis later using this script." -ForegroundColor White
    }
    
    default {
        Write-Host "Invalid choice. Exiting..." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Make sure REDIS_URL is set in your .env file" -ForegroundColor White
Write-Host "   REDIS_URL=redis://localhost:6379" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Start your facilitator:" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor Gray
Write-Host ""
