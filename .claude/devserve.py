"""개발용 정적 서버 — 캐시를 끈다.
python -m http.server 는 캐시 헤더를 안 보내서, 사파리가 index.html 을 붙들고
있으면 그 안에 적힌 옛 js·css 주소를 계속 물고 온다. 고친 게 폰에 안 보이는
이유가 대개 이것이다."""
import functools, http.server, socketserver, sys

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8712
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('0.0.0.0', port), H) as httpd:
    print(f'serving :{port} (no-store)')
    httpd.serve_forever()
