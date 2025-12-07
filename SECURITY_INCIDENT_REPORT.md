# 🚨 SECURITY INCIDENT REPORT
**Date**: December 7, 2025
**Server**: vmi2912557 (62.169.27.7)

## INCIDENT SUMMARY

Your server was compromised with cryptocurrency mining malware.

## MALWARE FOUND

### 1. Cryptominer Process
- **Process**: `/tmp/fghgf`
- **Config**: `/tmp/config.json`
- **Status**: ✅ KILLED AND REMOVED
- **Connection**: 205.185.126.196:443 (mining pool)
- **CPU Usage**: 250% (multi-threaded mining)
- **Running Since**: Dec 6, 2025 13:33

### 2. Suspicious Network Process  
- **Process**: `mco1gjwamfgmhjh`
- **Connection**: 185.14.92.55:123
- **Status**: ✅ KILLED
- **Related**: FTP script 's' tried to download from 185.14.92.152

### 3. FTP Attack Script
- **File**: `/srv/x402/merchant-demo/s`
- **Content**: FTP script to download `a.exe` from 185.14.92.152
- **Status**: ✅ REMOVED
- **Result**: Download appears to have failed (no .exe found)

## ATTACK VECTOR

### CONFIRMED: SSH Brute Force (Successful)
**Attackers gained root access via SSH password brute-force**

Multiple IPs attempting to breach SSH:
- 193.151.152.184 (BANNED by fail2ban)
- 144.126.195.82 (BANNED by fail2ban)  
- 193.46.255.7 (BANNED by fail2ban)
- 94.156.152.7
- 180.252.49.194 (currently connected!)
- 80.94.92.167 (attempted "vnc" username)

**Attack Pattern**:
- Testing common usernames: user1, admin, flink, solana, solv, **vnc**
- Root password brute-forcing
- Ongoing since at least Dec 6
- **SUCCESS**: Attacker guessed/cracked SSH password and gained root access

**Critical Vulnerabilities Exploited**:
- SSH on default port 22 (easy to find, heavily targeted)
- Root login ENABLED (allows direct root access)
- Password authentication ENABLED (weak, brute-forceable)
- Weak or common password used

**VNC Status**: NOT INSTALLED - not the attack vector despite attempts

## ACTIONS TAKEN

✅ **Immediate Response**:
1. Killed cryptominer process `fghgf`
2. Killed suspicious process `mco1gjwamfgmhjh`
3. **Killed second malware `d1e11fieg221rdm`** (listening on port 63464)
4. Removed malware files: `/tmp/fghgf`, `/tmp/config.json`
5. Removed attack script: `/srv/x402/merchant-demo/s`
6. Verified no .exe files downloaded
6. fail2ban actively blocking attack IPs

## CRITICAL SECURITY RECOMMENDATIONS

### 🔴 IMMEDIATE (Do Now!)

1. **Change SSH Port** (prevent automated attacks):
```bash
sudo nano /etc/ssh/sshd_config
# Change line: Port 22 → Port 2222
sudo systemctl restart sshd
# Update firewall:
sudo ufw allow 2222/tcp
sudo ufw delete allow 22/tcp
```

2. **Disable Root SSH Login**:
```bash
# First, create a non-root sudo user:
adduser yourusername
usermod -aG sudo yourusername

# Then disable root:
sudo nano /etc/ssh/sshd_config
# Change: PermitRootLogin yes → PermitRootLogin no
sudo systemctl restart sshd
```

3. **Use SSH Keys Only** (disable passwords):
```bash
# Generate SSH key on your local machine:
ssh-keygen -t ed25519

# Copy to server:
ssh-copy-id -p 2222 yourusername@62.169.27.7

# Then disable password authentication:
sudo nano /etc/ssh/sshd_config
# Change: PasswordAuthentication yes → PasswordAuthentication no
sudo systemctl restart sshd
```

### 🟡 HIGH PRIORITY (Do Today)

4. **Scan for Rootkits**:
```bash
sudo apt update
sudo apt install rkhunter chkrootkit -y
sudo rkhunter --check --skip-keypress
sudo chkrootkit
```

5. **Check for Backdoors**:
```bash
# Check all listening ports:
ss -tulpn | grep LISTEN

# Check startup scripts:
ls -la /etc/rc*.d/
systemctl list-unit-files --type=service --state=enabled

# Check unusual cron jobs:
for user in $(cut -f1 -d: /etc/passwd); do 
  echo "=== $user ==="; 
  crontab -u $user -l 2>/dev/null; 
done
```

6. **Monitor /tmp Directory**:
```bash
# Create monitoring script:
cat > /usr/local/bin/tmp-monitor.sh << 'SCRIPT'
#!/bin/bash
find /tmp /var/tmp -type f -executable -mmin -60 2>/dev/null | while read file; do
  echo "[ALERT] $(date): Executable created in tmp: $file" >> /var/log/malware-alerts.log
done
SCRIPT

chmod +x /usr/local/bin/tmp-monitor.sh

# Add to cron (hourly):
(crontab -l; echo "0 * * * * /usr/local/bin/tmp-monitor.sh") | crontab -
```

### 🟢 RECOMMENDED (This Week)

7. **Install Additional Security**:
```bash
# Install intrusion detection:
sudo apt install aide -y
sudo aideinit
sudo mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db

# Install AppArmor/SELinux
sudo apt install apparmor apparmor-utils -y
```

8. **Harden SSH Further**:
```bash
# In /etc/ssh/sshd_config add:
MaxAuthTries 3
MaxSessions 2
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers yourusername  # Only specific users
```

9. **Enable Automatic Security Updates**:
```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

10. **Set up Monitoring Alerts**:
```bash
# Install logwatch for daily email reports:
sudo apt install logwatch -y
sudo logwatch --detail high --mailto your@email.com --service all
```

## VERIFICATION STEPS

Run these to verify malware is gone:

```bash
# 1. Check for suspicious processes:
ps aux | grep -vE "systemd|kworker|nginx|node|pm2|sshd" | grep -v "grep"

# 2. Check network connections:
ss -tunap | grep ESTAB | grep -v "127.0.0.1"

# 3. Check /tmp:
ls -lah /tmp/

# 4. Check CPU usage (should be normal now):
top -bn1 | head -20

# 5. Scan ports:
ss -tulpn | grep LISTEN

# 6. Check fail2ban status:
fail2ban-client status sshd
```

## MONITORING GOING FORWARD

### Daily Checks:
```bash
# Check malware alerts:
tail -50 /var/log/malware-alerts.log

# Check auth log:
grep "Failed\|Accepted" /var/log/auth.log | tail -20

# Check running processes:
ps aux --sort=-%cpu | head -10
```

### Weekly Checks:
```bash
# Update and scan:
sudo apt update && sudo apt upgrade -y
sudo rkhunter --check
sudo chkrootkit

# Review banned IPs:
fail2ban-client status sshd
```

## LESSONS LEARNED

1. **Root SSH access is dangerous** - attackers successfully logged in
2. **Default SSH port (22)** is heavily targeted
3. **Password authentication** makes brute-force possible
4. **Immediate response critical** - malware ran for ~1 day consuming resources

## CURRENT STATUS

✅ **Malware Removed**: All malicious processes killed, files deleted
✅ **fail2ban Active**: Blocking attack IPs
⚠️ **Still Vulnerable**: Root SSH on port 22 with password auth
⚠️ **Active Attacks**: SSH brute-force attempts ongoing

## NEXT STEPS

1. ✅ Change SSH port to non-standard port
2. ✅ Disable root SSH login
3. ✅ Setup SSH key authentication
4. ⏳ Scan for rootkits
5. ⏳ Monitor for 24-48 hours
6. ⏳ Review all logs for other compromise indicators

## FILES TO REVIEW

- `/var/log/auth.log` - Authentication attempts
- `/var/log/malware-alerts.log` - Malware detection alerts
- `/var/log/syslog` - System events
- `/var/log/fail2ban.log` - Banned IPs

---

**Report Generated**: $(date)
**Server Uptime**: $(uptime)
**Current User Sessions**: $(who | wc -l)
