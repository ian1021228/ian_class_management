// /api/health.js - Vercel Serverless Function Health Check
export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    system: 'PalClass Cloud API Gateway',
    version: '5.7.0',
    mode: 'Vercel Serverless Ready',
    timestamp: new Date().toISOString()
  });
}
