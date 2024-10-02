CREATE TABLE Posts (
    Id INT,
    AcceptedAnswerId INT NULL DEFAULT NULL,
    AnswerCount INT DEFAULT 0,
    Body TEXT,
    ClosedDate DATETIME(6) NULL DEFAULT NULL,
    CommentCount INT DEFAULT 0,
    CommunityOwnedDate DATETIME(6) NULL DEFAULT NULL,
    ContentLicense TEXT NULL DEFAULT NULL,
    CreationDate DATETIME(6) NULL DEFAULT NULL,
    FavoriteCount INT DEFAULT 0,
    LastActivityDate DATETIME(6) NULL DEFAULT NULL,
    LastEditDate DATETIME(6) NULL DEFAULT NULL,
    LastEditorDisplayName TEXT,
    LastEditorUserId INT NULL DEFAULT NULL,
    OwnerDisplayName TEXT DEFAULT NULL,
    OwnerUserId INT NULL DEFAULT NULL,
    ParentId INT NULL DEFAULT NULL,
    PostTypeId INT, -- 1 = Question, 2 = Answer
    Score INT DEFAULT 0,
    Tags TEXT,
    Title TEXT,
    ViewCount INT DEFAULT 0,
    PRIMARY KEY(Id)
);
.import --csv --skip 1 -v Posts.csv Posts

-- Adjust NULL and Zero values
UPDATE Posts SET AcceptedAnswerId = NULL WHERE AcceptedAnswerId = '';
UPDATE Posts SET AnswerCount = 0 WHERE AnswerCount = '';
UPDATE Posts SET ClosedDate = NULL WHERE ClosedDate = '';
UPDATE Posts SET CommentCount = 0 WHERE CommentCount = '';
UPDATE Posts SET CommunityOwnedDate = NULL WHERE CommunityOwnedDate = '';
UPDATE Posts SET CreationDate = NULL WHERE CreationDate = '';
UPDATE Posts SET FavoriteCount = 0 WHERE FavoriteCount = '';
UPDATE Posts SET LastActivityDate = NULL WHERE LastActivityDate = '';
UPDATE Posts SET LastEditDate = NULL WHERE LastEditDate = '';
UPDATE Posts SET LastEditorUserId = NULL WHERE LastEditorUserId = '';
UPDATE Posts SET OwnerUserId = NULL WHERE OwnerUserId = '';
UPDATE Posts SET ParentId = NULL WHERE ParentId = '';
UPDATE Posts SET Score = 0 WHERE Score = '';
UPDATE Posts SET ViewCount = 0 WHERE ViewCount = '';

CREATE TABLE Tags (
    Id INT,
    Count INT DEFAULT 0,
    ExcerptPostId INT NULL DEFAULT NULL,
    TagName TEXT,
    WikiPostId INT NULL DEFAULT NULL,
    PRIMARY KEY(Id)
);
.import --csv --skip 1 -v Tags.csv Tags

-- Adjust NULL and Zero values
UPDATE Tags SET Count = 0 WHERE Count = '';
UPDATE Tags SET ExcerptPostId = NULL WHERE ExcerptPostId = '';
UPDATE Tags SET WikiPostId = NULL WHERE WikiPostId = '';

CREATE TABLE Users (
    Id INT,
    AboutMe TEXT,
    AccountId INT,
    CreationDate DATETIME(6) NULL DEFAULT NULL,
    DisplayName TEXT,
    DownVotes INT DEFAULT 0,
    LastAccessDate DATETIME(6) NULL DEFAULT NULL,
    Location TEXT,
    Reputation INT DEFAULT 0,
    UpVotes INT DEFAULT 0,
    Views INT DEFAULT 0,
    WebsiteUrl TEXT,
    PRIMARY KEY(Id)
);
.import --csv --skip 1 -v Users.csv Users

-- Adjust NULL and Zero values
UPDATE Users SET CreationDate = NULL WHERE CreationDate = '';
UPDATE Users SET CreationDate = NULL WHERE CreationDate = '';
UPDATE Users SET DownVotes = 0 WHERE DownVotes = '';
UPDATE Users SET LastAccessDate = NULL WHERE LastAccessDate = '';
UPDATE Users SET Reputation = 0 WHERE Reputation = '';
UPDATE Users SET UpVotes = 0 WHERE UpVotes = '';
UPDATE Users SET Views = 0 WHERE Views = '';


CREATE TABLE Comments (
    Id INT,
    ContentLicense TEXT NULL DEFAULT NULL,
    CreationDate DATETIME(6) NULL DEFAULT NULL,
    PostId INT NULL DEFAULT NULL,
    Score INT DEFAULT 0,
    Text TEXT,
    UserDisplayName TEXT,
    UserId INT NULL DEFAULT NULL,
    PRIMARY KEY(Id)
);
.import --csv --skip 1 -v Comments.csv Comments

-- Adjust NULL and Zero values
UPDATE Comments SET CreationDate = NULL WHERE CreationDate = '';
UPDATE Comments SET PostId = NULL WHERE PostId = '';
UPDATE Comments SET Score = 0 WHERE Score = '';
UPDATE Comments SET UserId = NULL WHERE UserId = '';

CREATE TABLE Votes (
    Id INT,
    BountyAmount INT DEFAULT 0,
    CreationDate DATETIME(6) NULL DEFAULT NULL,
    PostId INT NULL DEFAULT NULL,
    UserId INT NULL DEFAULT NULL,
    VoteTypeId INT,
    PRIMARY KEY(Id)
);
.import --csv --skip 1 -v Votes.csv Votes

-- Adjust NULL and Zero values
UPDATE Votes SET BountyAmount = 0 WHERE BountyAmount = '';
UPDATE Votes SET CreationDate = NULL WHERE CreationDate = '';
UPDATE Votes SET PostId = NULL WHERE PostId = '';
UPDATE Votes SET UserId = NULL WHERE UserId = '';
