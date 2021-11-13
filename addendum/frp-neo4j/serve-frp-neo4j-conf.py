# Python 3 server example
from http.server import BaseHTTPRequestHandler, HTTPServer
import time

hostName = "0.0.0.0"
serverPort = 8080

# modulo configurations
mod_cn = 30

# Base port
base_port = 8082

frpc_conf = '''
[common]
server_addr = 155.54.204.57
server_port = 8081

[browser{0}]
type = tcp
local_ip = 127.0.0.1
local_port = 7474
remote_port = {0}

[bolt{1}]
type = tcp
local_ip = 127.0.0.1
local_port = 7687
remote_port = {1}
'''

# conn number, modulo mod_cn.
# Ports numbers are: base_port + (cn * 2), base_port + (cn*2) + 1 
cn = 0

class MyServer(BaseHTTPRequestHandler):
  
    def do_GET(self):
        global frpc_conf, cn, mod_cn, base_port
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(bytes(frpc_conf.format(base_port + (cn*2),
            base_port + 1 + (cn*2)), "utf-8"))
        cn = cn + 1
        cn = cn % mod_cn

if __name__ == "__main__":        
    webServer = HTTPServer((hostName, serverPort), MyServer)
    print("Server started http://%s:%s" % (hostName, serverPort))

    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")
