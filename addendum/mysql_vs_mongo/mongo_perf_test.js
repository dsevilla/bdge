// http://bonesmoses.org/2016/07/15/pg-phriday-a-postgres-persepctive-on-mongodb/
use perf_test

var currentDate = new Date();
currentDate.setHours(0,0,0,0)
var batch = new Array()

var start = new Date()
for (var i = 1; i <= 1000000; i++) {
  batch[i] = {
        _id: i,
        location: i % 1000,
        reading: i % 100,
        readingDate: new Date(currentDate - i * 10000)
    }
}

db.sensorLog.insert(batch)

(new Date() - start) / 1000

// 31.791

start = new Date()
db.sensorLog.ensureIndex( { readingDate: 1 } )
(new Date() - start) / 1000

// 3.2

var currentDate = new Date()
currentDate.setHours(0,0,0,0)

start = new Date()
db.sensorLog.update({
    readingDate: {
        $gte: new Date(currentDate.getTime() - 8*86400000),
        $lt: new Date(currentDate.getTime() - 7*86400000)
    }
  },
  { $inc: { reading: 1 } },
  { multi: true }
)
(new Date() - start)

WriteResult({ "nMatched" : 8640, "nUpserted" : 0, "nModified" : 8640 })

// 77

start = new Date()
db.sensorLog.remove({
    readingDate: {
        $gte: new Date(currentDate.getTime() - 9*86400000),
        $lt: new Date(currentDate.getTime() - 8*86400000)
    }
  }
)
(new Date() - start)

WriteResult({ "nRemoved" : 8640 })

// 145
