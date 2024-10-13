DROP TABLE IF EXISTS users, activities;

CREATE TABLE users (
  username text PRIMARY KEY,
  password text NOT NULL
);

CREATE TABLE activities (
  id serial PRIMARY KEY,
  title text NOT NULL, 
  category text NOT NULL,
  date_completed date NOT NULL,
  min_to_complete integer NOT NULL CHECK (min_to_complete > 0),
  username text 
    NOT NULL 
    REFERENCES users (username) 
    ON DELETE CASCADE
    ON UPDATE CASCADE
);