// http://bonesmoses.org/2016/07/15/pg-phriday-a-postgres-persepctive-on-mongodb/
use db

var timing = new Array()

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

// We start at 1 to match the ID of the MySQL query performance data
timing[1] = (new Date() - start) / 1000

// 13.638

start = new Date()
db.sensorLog.ensureIndex( { readingDate: 1 } )
timing[2] = (new Date() - start) / 1000

// 3.013

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
timing[3] = (new Date() - start) / 1000

//WriteResult({ "nMatched" : 8640, "nUpserted" : 0, "nModified" : 8640 })
// 77

start = new Date()
db.sensorLog.remove({
    readingDate: {
        $gte: new Date(currentDate.getTime() - 9*86400000),
        $lt: new Date(currentDate.getTime() - 8*86400000)
    }
  }
)
timing[4] = (new Date() - start) / 1000

// WriteResult({ "nRemoved" : 8640 })

// 154

start = new Date()
db.sensorLog.count()
timing[5] = (new Date() - start) / 1000

// 4

start = new Date()
db.sensorLog.find({
    readingDate: {
        $lt: new Date(currentDate.getTime() - 14*86400000)
    }
  }
).sort({readingDate: 1}).skip(20).limit(5)
timing[6] = (new Date() - start) / 1000

// 14

timing.shift(); // Remove the 0th position

// 
var output = {};
var v = 1;
timing.forEach(function(e) { this.output[this.v++] = e;});

// Produce the series (data frame)
q = { "mongo"  : output }

db.dropDatabase()
