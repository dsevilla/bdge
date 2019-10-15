# -*- mode: python; coding: utf-8; -*-
import sys
from wikiparse import WikiHandler
import happybase
import time

class FillWikiTable():
    """Llena la tabla Wiki"""
    def __init__(self):
        # Conectar a la base de datos a través de Thrift
        self.connection = happybase.Connection('127.0.0.1')
        self.connection.open()

        self.table = self.connection.table('wiki')

    def run(_s):
        def processdoc(d):
            print("Callback called with", d['title'])
            tuple_time = time.strptime(d['timestamp'], "%Y-%m-%dT%H:%M:%SZ")
            timestamp = int(time.mktime(tuple_time))
            _s.table.put(d['title'],
                         {'text:': d.get('text',''),
                          'revision:author': d.get('username',''),
                          'revision:comment': d.get('comment','')},
                         timestamp=timestamp)

        start = time.time()
        WikiHandler().parse(sys.stdin, processdoc)
        end = time.time()
        print ("End adding documents. Time: %.5f" % (end - start))

if __name__ == "__main__":
  FillWikiTable().run()
