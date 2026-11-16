"""Vercel 함수: GET /api/config (카카오 JS 키 전달)"""
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
    def do_GET(self):
        _send(self, *cafe_core.api_config())
