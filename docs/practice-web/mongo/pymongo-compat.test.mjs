import assert from "node:assert/strict";
import {
  PYMONGO_METHODS,
  PYTHON_LITERALS,
  translatePythonQuery
} from "./pymongo-compat.js";

assert.equal(PYMONGO_METHODS.count_documents, "countDocuments");
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

console.log("pymongo-compat: OK");
