-- Import the five CSV tables published by the 26-27 data release.
-- Column names and order follow preprocess/csvtoparquet.py. SQLite uses one
-- INTEGER type for Arrow int8/int32/int64 fields; DATETIME values remain in
-- the source ISO-8601 text representation.

.bail on

-- This is a one-time bulk load into a new database. Foreign-key declarations
-- are kept in the schema, but checks stay disabled while the tables load.
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;
PRAGMA foreign_keys = OFF;
PRAGMA temp_store = MEMORY;

BEGIN;

CREATE TABLE Users (
    Id INTEGER NOT NULL PRIMARY KEY,
    AboutMe TEXT,
    AccountId INTEGER,
    CreationDate DATETIME NOT NULL,
    DisplayName TEXT NOT NULL,
    DownVotes INTEGER NOT NULL DEFAULT 0,
    LastAccessDate DATETIME,
    Location TEXT,
    Reputation INTEGER NOT NULL DEFAULT 0,
    UpVotes INTEGER NOT NULL DEFAULT 0,
    Views INTEGER NOT NULL DEFAULT 0,
    WebsiteUrl TEXT
);
.import --csv --skip 1 -v Users.csv Users

-- Match csvtoparquet.py: empty optional values become NULL and empty counters
-- become their documented zero default.
UPDATE Users SET AboutMe = NULL WHERE AboutMe = '';
UPDATE Users SET AccountId = NULL WHERE AccountId = '';
UPDATE Users SET DownVotes = 0 WHERE DownVotes = '';
UPDATE Users SET LastAccessDate = NULL WHERE LastAccessDate = '';
UPDATE Users SET Location = NULL WHERE Location = '';
UPDATE Users SET Reputation = 0 WHERE Reputation = '';
UPDATE Users SET UpVotes = 0 WHERE UpVotes = '';
UPDATE Users SET Views = 0 WHERE Views = '';
UPDATE Users SET WebsiteUrl = NULL WHERE WebsiteUrl = '';

CREATE TABLE Posts (
    Id INTEGER NOT NULL PRIMARY KEY,
    AcceptedAnswerId INTEGER REFERENCES Posts(Id),
    AnswerCount INTEGER NOT NULL DEFAULT 0,
    Body TEXT,
    ClosedDate DATETIME,
    CommentCount INTEGER NOT NULL DEFAULT 0,
    CommunityOwnedDate DATETIME,
    ContentLicense TEXT,
    CreationDate DATETIME NOT NULL,
    LastActivityDate DATETIME NOT NULL,
    LastEditDate DATETIME,
    LastEditorDisplayName TEXT,
    LastEditorUserId INTEGER REFERENCES Users(Id),
    OwnerDisplayName TEXT,
    OwnerUserId INTEGER REFERENCES Users(Id),
    ParentId INTEGER REFERENCES Posts(Id),
    PostTypeId INTEGER NOT NULL,
    Score INTEGER NOT NULL DEFAULT 0,
    Tags TEXT,
    Title TEXT,
    ViewCount INTEGER NOT NULL DEFAULT 0
);
.import --csv --skip 1 -v Posts.csv Posts

UPDATE Posts SET AcceptedAnswerId = NULL WHERE AcceptedAnswerId = '';
UPDATE Posts SET AnswerCount = 0 WHERE AnswerCount = '';
UPDATE Posts SET Body = NULL WHERE Body = '';
UPDATE Posts SET ClosedDate = NULL WHERE ClosedDate = '';
UPDATE Posts SET CommentCount = 0 WHERE CommentCount = '';
UPDATE Posts SET CommunityOwnedDate = NULL WHERE CommunityOwnedDate = '';
UPDATE Posts SET ContentLicense = NULL WHERE ContentLicense = '';
UPDATE Posts SET LastEditDate = NULL WHERE LastEditDate = '';
UPDATE Posts SET LastEditorDisplayName = NULL WHERE LastEditorDisplayName = '';
UPDATE Posts SET LastEditorUserId = NULL WHERE LastEditorUserId = '';
UPDATE Posts SET OwnerDisplayName = NULL WHERE OwnerDisplayName = '';
UPDATE Posts SET OwnerUserId = NULL WHERE OwnerUserId = '';
UPDATE Posts SET ParentId = NULL WHERE ParentId = '';
UPDATE Posts SET Score = 0 WHERE Score = '';
UPDATE Posts SET Tags = NULL WHERE Tags = '';
UPDATE Posts SET Title = NULL WHERE Title = '';
UPDATE Posts SET ViewCount = 0 WHERE ViewCount = '';

CREATE TABLE Tags (
    Id INTEGER NOT NULL PRIMARY KEY,
    Count INTEGER NOT NULL DEFAULT 0,
    ExcerptPostId INTEGER REFERENCES Posts(Id),
    TagName TEXT NOT NULL,
    WikiPostId INTEGER REFERENCES Posts(Id)
);
.import --csv --skip 1 -v Tags.csv Tags

UPDATE Tags SET Count = 0 WHERE Count = '';
UPDATE Tags SET ExcerptPostId = NULL WHERE ExcerptPostId = '';
UPDATE Tags SET WikiPostId = NULL WHERE WikiPostId = '';

CREATE TABLE Comments (
    Id INTEGER NOT NULL PRIMARY KEY,
    ContentLicense TEXT,
    CreationDate DATETIME NOT NULL,
    PostId INTEGER NOT NULL REFERENCES Posts(Id),
    Score INTEGER NOT NULL DEFAULT 0,
    Text TEXT,
    UserDisplayName TEXT,
    UserId INTEGER REFERENCES Users(Id)
);
.import --csv --skip 1 -v Comments.csv Comments

UPDATE Comments SET ContentLicense = NULL WHERE ContentLicense = '';
UPDATE Comments SET Score = 0 WHERE Score = '';
UPDATE Comments SET Text = NULL WHERE Text = '';
UPDATE Comments SET UserDisplayName = NULL WHERE UserDisplayName = '';
UPDATE Comments SET UserId = NULL WHERE UserId = '';

CREATE TABLE Votes (
    Id INTEGER NOT NULL PRIMARY KEY,
    BountyAmount INTEGER NOT NULL DEFAULT 0,
    CreationDate DATETIME NOT NULL,
    PostId INTEGER NOT NULL REFERENCES Posts(Id),
    UserId INTEGER REFERENCES Users(Id),
    VoteTypeId INTEGER NOT NULL
);
.import --csv --skip 1 -v Votes.csv Votes

UPDATE Votes SET BountyAmount = 0 WHERE BountyAmount = '';
UPDATE Votes SET UserId = NULL WHERE UserId = '';

COMMIT;

-- Restore normal durability settings for later users of the database.
PRAGMA synchronous = NORMAL;
PRAGMA journal_mode = DELETE;
