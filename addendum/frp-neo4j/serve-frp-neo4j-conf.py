# Python 3 server example
from http.server import BaseHTTPRequestHandler, HTTPServer
import time

hostName = "localhost"#"neuromancer.inf.um.es"
serverPort = 8080

class MyServer(BaseHTTPRequestHandler):
  
    # modulo configurations
    mod_cn = 30

    # Base port
    base_port = 8082

    frpc_conf = '''
[common]
server_addr = 155.54.204.57
server_port = 8081

[ssh{0}]
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

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(bytes(self.frpc_conf.format(self.base_port + (self.cn*2),
            self.base_port + 1 + (self.cn*2)),
            "utf-8"))
        self.cn = self.cn + 1
        self.cn = self.cn % self.mod_cn

if __name__ == "__main__":        
    webServer = HTTPServer((hostName, serverPort), MyServer)
    print("Server started http://%s:%s" % (hostName, serverPort))

    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")
