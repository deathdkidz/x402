import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
import config from '../config/index.js';

// Block common attack patterns
const suspiciousPatterns = [
  /\.\.\/\.\.\//,           // Path traversal
  /\/bin\/sh/,              // Shell access attempts
  /eval-stdin\.php/,        // PHPUnit RCE
  /\/cgi-bin\//,            // CGI exploits
  /\.env$/,                 // Environment file access
  /\/phpunit\//,            // PHPUnit exploits
  /\/vendor\//,             // Vendor folder scans
  /\/\.git\//,              // Git folder access
  /\/config\//,             // Config folder access
  /\.sql$/,                 // SQL file access
  /\/admin/,                // Admin panel scans
  /\/wp-admin\//,           // WordPress scans
  /\/\.well-known\//,       // Well-known paths (allow Let's Encrypt)
];

// Allowed paths
const allowedPaths = [
  /^\/$/,                   // Root endpoint
  /^\/health$/,             // Health check
  /^\/networks$/,           // Networks info
  /^\/verify$/,             // Verify payment
  /^\/settle$/,             // Settle payment
  /^\/merchant$/,           // Get current merchant
];

// Track suspicious IPs
const suspiciousIPs = new Map<string, { count: number; lastSeen: number }>();
const BAN_THRESHOLD = 10; // Ban after 10 suspicious requests
const BAN_DURATION = 3600000; // 1 hour in ms

export const securityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
  const path = req.path;
  const method = req.method;

  // Check if IP is banned
  const ipData = suspiciousIPs.get(clientIP);
  if (ipData && ipData.count >= BAN_THRESHOLD) {
    const timeSinceBan = Date.now() - ipData.lastSeen;
    if (timeSinceBan < BAN_DURATION) {
      logger.warn(`🚫 Blocked banned IP: ${clientIP} (${path})`);
      return res.status(403).json({ error: 'Forbidden' });
    } else {
      // Unban after duration
      suspiciousIPs.delete(clientIP);
    }
  }

  // Check for suspicious patterns
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(path));
  
  if (isSuspicious) {
    // Increment suspicious activity counter
    const current = suspiciousIPs.get(clientIP) || { count: 0, lastSeen: 0 };
    current.count++;
    current.lastSeen = Date.now();
    suspiciousIPs.set(clientIP, current);

    logger.warn(`⚠️ Suspicious request from ${clientIP}: ${method} ${path} (count: ${current.count})`);
    
    if (current.count >= BAN_THRESHOLD) {
      logger.error(`🚫 IP banned for suspicious activity: ${clientIP}`);
    }
    
    return res.status(404).json({ error: 'Not Found' });
  }

  // Check if path is allowed
  const isAllowed = allowedPaths.some(pattern => pattern.test(path));
  if (!isAllowed && path !== '/') {
    logger.warn(`🔒 Unauthorized path access attempt: ${clientIP} → ${method} ${path}`);
    return res.status(404).json({ error: 'Not Found' });
  }

  next();
};

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of suspiciousIPs.entries()) {
    if (now - data.lastSeen > BAN_DURATION * 2) {
      suspiciousIPs.delete(ip);
    }
  }
}, config.securityCleanupIntervalMs);
