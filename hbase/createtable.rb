create 'wiki' , 'text', 'revision'

disable 'wiki' # Para evitar su uso temporal

alter 'wiki' , { NAME => 'text', VERSIONS => org.apache.hadoop.hbase.HConstants::ALL_VERSIONS }

alter 'wiki' , { NAME => 'revision', VERSIONS => org.apache.hadoop.hbase.HConstants::ALL_VERSIONS }

alter 'wiki' , { NAME => 'text', COMPRESSION => 'GZ', BLOOMFILTER => 'ROW'}

enable 'wiki'
