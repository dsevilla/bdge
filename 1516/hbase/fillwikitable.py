# -*- mode: python; coding: utf-8; -*-

from wikiparse import WikiHandler
import happybase
import time
import sys
reload(sys)
sys.setdefaultencoding('utf-8')

class FillWikiTable():
    """Llena la tabla de Wiki"""
    def __init__(self):
        self.counter = 0

        # Conectar a la base de datos a través de Thrift
        self.connection = happybase.Connection('127.0.0.1')
        self.connection.open()

        self.table = self.connection.table('wiki')

    def run(self):
        def processdoc(d):
            print "Callback called with", d['title']
            tuple_time = time.strptime(d['timestamp'], "%Y-%m-%dT%H:%M:%SZ")
            timestamp = int(time.mktime(tuple_time))
            self.table.put(d['title'],
                           {'text:': d.get('text',''),
                            'revision:author': d.get('username',''),
                            'revision:comment': d.get('comment','')},
                           timestamp=timestamp)

        fun = lambda d: processdoc(d)
        WikiHandler().parse(sys.stdin, fun)
        print "End adding documents."

if __name__ == "__main__":
  FillWikiTable().run()
