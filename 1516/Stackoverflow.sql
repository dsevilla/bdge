DROP SCHEMA IF EXISTS stackoverflow;
CREATE SCHEMA stackoverflow;
USE stackoverflow;

DROP TABLE Posts;
CREATE TABLE Posts (Id int,PostTypeId TEXT,AcceptedAnswerId TEXT,ParentId TEXT,CreationDate TEXT,DeletionDate TEXT,Score TEXT,ViewCount TEXT,Body TEXT,OwnerUserId TEXT,OwnerDisplayName TEXT,LastEditorUserId TEXT,LastEditorDisplayName TEXT,LastEditDate TEXT,LastActivityDate TEXT,Title TEXT,Tags TEXT,AnswerCount TEXT,CommentCount TEXT,FavoriteCount TEXT,ClosedDate TEXT,CommunityOwnedDate TEXT,
PRIMARY KEY(Id)
-- FOREIGN KEY (ParentId) REFERENCES Posts(Id),
-- FOREIGN KEY (OwnerUserId) REFERENCES Users(Id)
)
CHARACTER SET utf8;


DROP TABLE Users;
CREATE TABLE Users (
Id int,Reputation TEXT,CreationDate TEXT,DisplayName TEXT,LastAccessDate TEXT,WebsiteUrl TEXT,Location TEXT,AboutMe TEXT,Views TEXT,UpVotes TEXT,DownVotes TEXT,ProfileImageUrl TEXT,EmailHash TEXT,Age TEXT,AccountId TEXT,
PRIMARY KEY (Id)
)
CHARACTER SET utf8;


DROP TABLE Comments;
CREATE TABLE Comments (
Id int,PostId TEXT,Score TEXT,Text TEXT,CreationDate TEXT,UserDisplayName TEXT,UserId TEXT,
PRIMARY KEY(Id)
-- FOREIGN KEY (PostId) REFERENCES Posts(Id),
-- FOREIGN KEY (UserId) REFERENCES Users(Id)
)
CHARACTER SET utf8;

LOAD DATA LOCAL INFILE "/tmp/Posts.csv" INTO TABLE Posts COLUMNS TERMINATED BY ',' ENCLOSED BY '"' ESCAPED BY '"' LINES TERMINATED BY '\r\n' IGNORE 1 LINES;
