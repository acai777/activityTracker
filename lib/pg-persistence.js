const { dbQuery } = require("./db-query");
const bcrypt = require("bcrypt");
const SALT = 10; 

module.exports = class PgPersistence {
  constructor(session) {
    this.username = session.username;
    this.password = session.password; 
  }

  // Returns a Promise which resolves to the rowCount value. This function adds a new activity into the database for the user in question. 
  async addActivity(newActivity) {
    const ADD_ACTIVITY = "INSERT INTO activities" + 
                         " (title, category, date_completed, min_to_complete, username) VALUES" + 
                         " ($1, $2, $3, $4, $5)"; 
                         
    let result = await dbQuery(ADD_ACTIVITY, ...newActivity, this.username);
    
    return result.rowCount > 0; 
  }

  // Returns a Promise that resolves to `true` if `username` and `password`
  // combine to identify a legitimate application user, `false` if either the
  // `username` or `password` is invalid.
  async authenticate(username, password) {
    const FIND_HASHED_PASSWORD = "SELECT password FROM users" +
                                 "  WHERE username = $1";

    let result = await dbQuery(FIND_HASHED_PASSWORD, username);
    if (result.rowCount === 0) return false;

    return bcrypt.compare(password, result.rows[0].password);
  }

  // Checks if the username already exists
  async checkIfUsernameExists(username) {
    const CHECK_USERNAME = "SELECT NULL FROM users WHERE username = $1";

    let result = await dbQuery(CHECK_USERNAME, username);
    return result.rowCount > 0; 
  }

  // Checks that the activity is a valid ID in the database. 
  async checkIsValidActivity(activityId) {
    let CHECK_VALID = "SELECT NULL FROM activities where id = $1 AND username = $2";

    let result = await dbQuery(CHECK_VALID, activityId, this.username);
    return result.rowCount > 0; 
  }

  // Create a new account
  async createAccount(username, password) {
    const CREATE_ACCOUNT = "INSERT INTO users (username, password) VALUES ($1, $2)";
    const hash = await bcrypt.hash(password, SALT); // second arg is the salt
    
    let result = await dbQuery(CREATE_ACCOUNT, username, hash);

    return result.rowCount > 0; 
  }

  // Delete the user from the database. 
  async deleteAccount() {
    const DELETE_ACCOUNT = "DELETE FROM users WHERE username = $1";
    let result = await dbQuery(DELETE_ACCOUNT, this.username);

    return result.rowCount > 0; 

  }

  // Delete an activity. Returns a Promise which resolves to a boolean, indicating whether the activity was successfully deleted or not.
  async deleteActivity(activityId) {
    const DELETE_ACTIVITY = "DELETE FROM activities " + 
                            "WHERE id = $1";

    let result = await dbQuery(DELETE_ACTIVITY, activityId);

    return result.rowCount > 0; 
  }

  // Edit an activity
  async editActivity(changes) {
    const CHANGES = "UPDATE activities " + 
                    "SET title = $1, category = $2, date_completed = $3, " + 
                    "min_to_complete = $4 " + 
                    "WHERE id = $5 AND username = $6";

    let result = await dbQuery(CHANGES, ...changes, this.username);

    return result.rowCount > 0; 
  }

  // return user account info 
  getAccountInfo() {
    return [this.username, this.password];
  }

  // Returns a Promise which resolves to the activity object.
  async getActivity(activityId) {
    const GET_ACTIVITY = "SELECT id, title, category, TO_CHAR(date_completed, 'YYYY-MM-DD') AS date_completed, min_to_complete, username FROM activities WHERE id = $1 AND username = $2"; // SELF-NOTE: date will only show up in Chrome with the YYYY-MM-DD format, if inserting as date value inside input tag.

    let result = await dbQuery(GET_ACTIVITY, activityId, this.username);
    let activity = result.rows[0];
    return activity; 
  }

  // Returns total number of activities the user has
  async getActivityCount() {
    const GET_ROW_COUNT = "SELECT COUNT(id) FROM activities WHERE username = $1";

    let result = await dbQuery(GET_ROW_COUNT, this.username);
    return result.rows[0].count; 
  }

  // Check if is same account info
  isSameAccount(username, password) {
    return username === this.username && password === this.password; 
  }

  // Check if the activity is the same activity
  async isSameActivity(changes) {
    const IS_SAME = "SELECT NULL FROM activities " + 
                    "WHERE title = $1 AND category = $2 " + 
                    "AND date_completed = $3 AND min_to_complete = $4 " +
                    "AND id = $5 AND username = $6";
    
    let result = await dbQuery(IS_SAME, ...changes, this.username);

    return result.rowCount > 0; 
  }

  // Returns `true` if `error` seems to indicate a `UNIQUE` constraint
  // violation, `false` otherwise.
  isUniqueConstraintViolation(error) {
    return /duplicate key value violates unique constraint/.test(String(error));
  }
  
  // Returns a Promise which resolves to current list of activities, sorted.
  async loadSortedActivities(sortColumn, ascend) {

    // Want to be case-insensitive, but also account for fact that we can also sort on date and integer type columns. Applying a string function lower() to non-string column types would throw an error. 
    if (["title", "category"].includes(sortColumn)) {
      sortColumn = "lower(" + sortColumn + ")";
    } 

    // PostgreSQL does not support parameters for identifiers i.e., it cannot be used to identify columns or table names. It can only support values. Thus, cannot do "ORDER BY $1." Use string concatenation to resolve this issue. Should be safe, as the `sortColumn` and `ascend` variables can never be manipulated directly by users. 
    const GET_ACTIVITIES = "SELECT id, title, category, TO_CHAR(date_completed, 'MM/DD/YYYY') AS date, " +
                           "min_to_complete, username FROM activities " + 
                           "WHERE username = $1";
                           
    let tempArray = [GET_ACTIVITIES, "ORDER BY", sortColumn, ascend];
    const GET_SORTED_ACTIVITIES = tempArray.join(" ");

    let result = await dbQuery(GET_SORTED_ACTIVITIES, this.username);

    let activities = result.rows; 
    return activities; 
  }

  // Update account info 
  async updateAccount(username, password) {
    const UPDATE_ACCOUNT = "UPDATE users SET username = $1, password = $2 WHERE username = $3";
    const hash = await bcrypt.hash(password, SALT); // second arg is the salt
    
    let result = await dbQuery(UPDATE_ACCOUNT, username, hash, this.username);

    return result.rowCount > 0; 
  }

}