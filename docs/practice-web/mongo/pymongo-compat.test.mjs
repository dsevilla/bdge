import assert from "node:assert/strict";
import {
  PYMONGO_ARGUMENTS,
  PYMONGO_ATTRIBUTES,
  PYMONGO_METHODS,
  PYTHON_LITERALS,
  translatePythonQuery
} from "./pymongo-compat.js";

assert.equal(PYMONGO_METHODS.count_documents, "countDocuments");
assert.equal(PYMONGO_METHODS.update_one, "updateOne");
assert.equal(PYMONGO_ATTRIBUTES.matched_count, "matchedCount");
assert.equal(PYMONGO_ARGUMENTS.array_filters, "arrayFilters");
assert.equal(PYTHON_LITERALS.None, "null");

assert.equal(
  translatePythonQuery('db.posts.count_documents({"OwnerUserId": {"$ne": None}})'),
  'db.posts.countDocuments({"OwnerUserId": {"$ne": null}})'
);

assert.equal(
  translatePythonQuery('db.users.find({"Activo": True, "Borrado": False}).to_list()'),
  'db.users.find({"Activo": true, "Borrado": false}).all()'
);

assert.equal(
  translatePythonQuery('db.posts.find({}).sort([("Score", -1), ("Id", 1)]).limit(5).to_list()'),
  'db.posts.find({}).sort([["Score", -1], ["Id", 1]]).limit(5).all()'
);

assert.equal(
  translatePythonQuery('db.posts.find_one({"Title": "None True # sin cambio"}) # comentario'),
  'db.posts.findOne({"Title": "None True # sin cambio"}) // comentario'
);

assert.equal(
  translatePythonQuery('db.posts.aggregate([{"$match": {"Tags": {"$ne": None}}}]).to_list()'),
  'db.posts.aggregate([{"$match": {"Tags": {"$ne": null}}}]).all()'
);

assert.equal(
  translatePythonQuery('db.posts.find({"Title": ".sort([(\\"x\\", 1)])"}).to_list()'),
  'db.posts.find({"Title": ".sort([(\\"x\\", 1)])"}).all()'
);

assert.equal(
  translatePythonQuery('db.posts.update_one({"Id": 1}, {"$inc": {"Score": 1}}, upsert=True)'),
  'db.posts.updateOne({"Id": 1}, {"$inc": {"Score": 1}},{"upsert":true})'
);

assert.equal(
  translatePythonQuery('db.posts.update_many({"$or": [{"Score": {"$lt": 0}}, {"Score": {"$gt": 10}}]}, {"$set": {"Revisado": True}}, array_filters=[])'),
  'db.posts.updateMany({"$or": [{"Score": {"$lt": 0}}, {"Score": {"$gt": 10}}]}, {"$set": {"Revisado": true}},{"arrayFilters":[]})'
);

assert.equal(
  translatePythonQuery('db.posts.aggregate([], allow_disk_use=True)'),
  'db.posts.aggregate([],{"allowDiskUse":true})'
);

assert.equal(
  translatePythonQuery('db.posts.update_one({}, {"$set": {"x": 1}}).modified_count'),
  'db.posts.updateOne({}, {"$set": {"x": 1}}).modifiedCount'
);

const calls = [];
const fakeDb = {
  posts: {
    find: function (filter) {
      calls.push(["find", filter]);
      return {
        sort: function (specification) {
          calls.push(["sort", specification]);
          return this;
        },
        limit: function (amount) {
          calls.push(["limit", amount]);
          return this;
        },
        all: function () { return [{ Id: 7 }]; }
      };
    }
  }
};
const translated = translatePythonQuery(
  'db.posts.find({"OwnerUserId": {"$ne": None}}).sort([("Score", -1), ("Id", 1)]).limit(1).to_list()'
);
const result = new Function("db", '"use strict"; return (' + translated + ");")(fakeDb);
assert.deepEqual(result, [{ Id: 7 }]);
assert.deepEqual(calls, [
  ["find", { OwnerUserId: { $ne: null } }],
  ["sort", [["Score", -1], ["Id", 1]]],
  ["limit", 1]
]);

const updateCalls = [];
const updateDb = {
  posts: {
    updateMany: function (filter, modifier, options) {
      updateCalls.push([filter, modifier, options]);
      return { matchedCount: 3, modifiedCount: 2 };
    }
  }
};
const updateSource = translatePythonQuery(
  'db.posts.update_many({"$or": [{"Score": {"$lt": 0}}, {"Score": {"$gt": 10}}]}, {"$set": {"Revisado": True}}, array_filters=[]).modified_count'
);
const modifiedCount = new Function("db", '"use strict"; return (' + updateSource + ");")(updateDb);
assert.equal(modifiedCount, 2);
assert.deepEqual(updateCalls, [[
  { $or: [{ Score: { $lt: 0 } }, { Score: { $gt: 10 } }] },
  { $set: { Revisado: true } },
  { arrayFilters: [] }
]]);

console.log("pymongo-compat: OK");
