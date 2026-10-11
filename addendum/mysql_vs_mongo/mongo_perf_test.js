// Referencia ejecutable en mongosh de las operaciones usadas por benchmark.py
// La medición comparable se realiza con el cliente Python común
// Esta colección es exclusiva de la referencia; no se borran otras bases
const reference = db.getSiblingDB("benchmark_reference").sensor_log;
const count = Number(process.env.BENCHMARK_ROWS || 1000000);
const base = new Date("2026-01-01T00:00:00Z");
const days = value => new Date(base.getTime() - value * 86400000);
const durable = { writeConcern: { w: 1, j: true } };
const checkEqual = (expected, actual) => {
  if (expected !== actual) {
    throw new Error(`Esperado ${expected}; obtenido ${actual}`);
  }
};
reference.drop();
for (let first = 1; first <= count; first += 5000) {
  const batch = [];
  for (let id = first; id <= Math.min(first + 4999, count); id++) {
    batch.push({ _id: id, location: id % 1000, reading: id % 100,
                 reading_date: new Date(base.getTime() - id * 10000) });
  }
  reference.insertMany(batch, durable);
}
checkEqual(count, reference.countDocuments({}));
reference.createIndex({ reading_date: 1 }, { name: "idx_date" });
const changed = reference.updateMany(
  { reading_date: { $gte: days(8), $lt: days(7) } },
  { $inc: { reading: 1 } }, durable);
const removed = reference.deleteMany(
  { reading_date: { $gte: days(9), $lt: days(8) } }, durable);
const remaining = reference.countDocuments({});
const interval = reference.find({ reading_date: { $lt: days(14) } })
  .sort({ reading_date: 1 }).skip(20).limit(5).toArray();
checkEqual(count - removed.deletedCount, remaining);
checkEqual(5, interval.length);
printjson({ initial: count, updated: changed.modifiedCount,
            deleted: removed.deletedCount, remaining, interval });
