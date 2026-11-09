"""Vercel 함수: POST /api/feedback (정보 수정 제안)"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import cafe_core  # noqa: E402


def _send(h, status, obj):
    body = json.dumps(obj, ensure_ascii=False).encode()
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(body)



class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        ip = (self.headers.get("x-forwarded-for") or "").split(",")[0].strip() or self.client_address[0]
        _send(self, *cafe_core.api_feedback(self.rfile.read(min(n, 4001)), n, ip))
