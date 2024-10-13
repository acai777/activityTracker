const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const store = require("connect-loki");
const catchError = require("./lib/catch-error");
const PgPersistence = require("./lib/pg-persistence");

const DEFAULT_SORT_COLUMN = "title";
const DEFAULT_SORT_ORDER = "ASC";
const VALID_COLUMN_NAMES = ["title", "category", "date_completed", "min_to_complete"];
const MAX_ACTIVITIES_PER_PAGE = 5;
const MIN_PAGE_NUM = 1;

const app = express();
const host = "localhost";
const port = 3000;
const LokiStore = store(session);

const validateActivityForm = (name, whichName) => {
  return body(name)
    .trim()
    .isLength({ min: 1 })
    .withMessage(`The ${whichName} is required.`)
    .isLength({ max: 50 })
    .withMessage(`The ${whichName} must be between 1 and 50 characters.`);
};

// Gen sequence of numbers from one to `num`. Return as array.
const genArraySequence = num => {
  let numArray = [];
  for (let index = 1; index <= num; index +=1) {
    numArray.push(index);
  }

  return numArray;
};

// Page Number must be valid. Must be a number type, and must be between 1 and `numberOfPages`, inclusive.
const isValidPageNum = (requestedPageNum, numberOfPages) => {
  if (!Number.isFinite(requestedPageNum)) return false; 

  let validNumbers = genArraySequence(numberOfPages);
  if (!validNumbers.includes(requestedPageNum)) return false; 

  return true; 
};

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000, 
    path: "/",
    secure: false,
  },
  name: "activity-tracker-session-id",
  resave: false,
  saveUninitialized: true,
  secret: "this is not very secure",
  store: new LokiStore({}),
}));

app.use(flash());

// Create a new datastore
app.use((req, res, next) => {
  res.locals.store = new PgPersistence(req.session);
  next();
});

// Extract session info
app.use((req, res, next) => {
  let sortColumn = req.session.sortColumn;
  let sortAscend = req.session.sortAscend;
  res.locals.sortColumn = sortColumn ? sortColumn : DEFAULT_SORT_COLUMN;
  res.locals.sortAscend = sortAscend ? sortAscend : DEFAULT_SORT_ORDER;

  res.locals.username = req.session.username;
  res.locals.signedIn = req.session.signedIn;

  // Remember the requested URL for this cycle. This way, once the client does sign in, can redirect them to their previously requested path at res.locals.path. 
  res.locals.path = req.session.path;

  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

// Middleware to detect unauthorized access to routes. Redirect to signin page.
const requiresAuthentication = (req, res, next) => {
  if (!res.locals.signedIn) {
    console.log("Unauthorized.");

    // Save the requested page here so that we can log in once the user is signed in
    req.session.path = req.originalUrl; 

    req.flash("info", "Please sign in order to access your profile.");
    res.redirect("/users/signin");
  } else {
    next();
  }
};

// Get index page. Redirect to "/activities/page/1" path.
app.get("/", (req, res) => {
  res.redirect("/activities/page/1");
});

// GET activities from page X (pagination)
app.get("/activities/page/:pageNum", 
  requiresAuthentication,
  catchError(async (req, res) => {
    let requestedPageNum = +req.params.pageNum; 
    let sortColumn = res.locals.sortColumn;
    let ascend = res.locals.sortAscend;
    let myActivities = await res.locals.store.loadSortedActivities(sortColumn, ascend);

    let numberOfPages = Math.max(MIN_PAGE_NUM, Math.ceil(myActivities.length / MAX_ACTIVITIES_PER_PAGE)); // if user has no activities, want there to still be the first page, or else error will be thrown.  

    if (!isValidPageNum(requestedPageNum, numberOfPages)) {
      throw new Error("Invalid page number requested.");
    } else {
      let numberOfPagesArr = genArraySequence(numberOfPages);
      let firstActivityIndex = (requestedPageNum - 1) * MAX_ACTIVITIES_PER_PAGE;
      let lastActivityIndex = firstActivityIndex + MAX_ACTIVITIES_PER_PAGE;

      let requestedActivities = myActivities.slice(firstActivityIndex, lastActivityIndex);
      res.render("activities", { 
        myActivities: requestedActivities,
        numberOfPagesArr,
        currentPage: requestedPageNum
      });
    }
  })
);

// Get to the add new activity page
app.get("/activity/new",
  requiresAuthentication,
  (req, res) => {
    res.render("add-activity");
  }
);

// Post: Add a new activity
app.post("/activity/new",
  requiresAuthentication,
  [
    validateActivityForm("title", "title"),
    validateActivityForm("category", "category"),

    body("date")
      .notEmpty()
      .withMessage("Please enter a date. Date cannot be empty."),

    body("min_to_complete")
      .notEmpty()
      .withMessage("Please enter the time spent on this activity. Value cannot be empty"),
  ],

  catchError(async (req, res) => {
    const {title, category, date, min_to_complete} = req.body;
    let errors = validationResult(req);

    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("add-activity", {
        title,
        category,
        date,
        min_to_complete,
        flash: req.flash(),
      });
    } else {

      let newActivity = [
        title,
        category,
        date,
        min_to_complete
      ];

      let created = await res.locals.store.addActivity(newActivity);
      if (!created) throw new Error("Not found.");

      req.flash("success", "The activity has been added.");
      res.redirect("/activities/page/1");
    }
  })
);

// GET edit activity page
app.get("/activities/edit/:activityId",
  requiresAuthentication,
  catchError(async (req, res) => {
    let activityId = +req.params.activityId;
    let isValid = await res.locals.store.checkIsValidActivity(activityId);

    if (!isValid) throw new Error("Activity not found.");

    let activity = await res.locals.store.getActivity(activityId);
    const {title, category, date_completed, min_to_complete} = activity;

    res.render("edit-activity", {
      title,
      category,
      date: date_completed,
      min_to_complete,
      activityId
    });
    
  })
);

// POST to the edit activity page (make the edits, if valid)
app.post("/activities/edit/:activityId",
  requiresAuthentication,
  [
    validateActivityForm("title", "title"),
    validateActivityForm("category", "category"),

    body("date")
      .notEmpty()
      .withMessage("Please enter a date. Date cannot be empty."),

    body("min_to_complete")
      .notEmpty()
      .withMessage("Please enter the time spent on this activity. Value cannot be empty"),
  ],

  catchError(async (req, res) => {
    let activityId = +req.params.activityId;
    const {title, category, date, min_to_complete} = req.body;

    let changes = [
      title,
      category,
      date,
      min_to_complete,
      activityId
    ];

    let errors = validationResult(req);

    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("edit-activity", {
        title,
        category,
        date,
        min_to_complete,
        activityId,
        flash: req.flash(),
      });
    } else if (await res.locals.store.isSameActivity(changes)) {
      req.flash("info", "No edits were made.");
      res.redirect("/activities/page/1");
    } else if (!await res.locals.store.checkIsValidActivity(activityId)) {
      throw new Error("Activity not found.");
    } else {
      let changed = await res.locals.store.editActivity(changes);
      if (!changed) throw new Error("Not found.");

      req.flash("success", "The activity has been changed.");
      res.redirect("/activities/page/1");
    }
  })
);

// POST: Delete an activity
app.post("/activity/delete/:activityId",
  requiresAuthentication,
  catchError(async (req, res) => {
    let activityId = +req.params.activityId;
    let deleted = await res.locals.store.deleteActivity(activityId);
    if (!deleted) throw new Error("This activity is not found.");

    req.flash("success", "The activity has been successfully deleted");
    res.redirect("/activities/page/1");
  })
);

// GET: Change sorting order in table. Want same page to be returned (so if currently on page 3, after the sort, still want to be on page 3)
app.get("/sort/:column/:pageNum",
  requiresAuthentication,
  catchError(async (req, res, next) => {
    let columnName = req.params.column;
    if (!VALID_COLUMN_NAMES.includes(columnName)) throw new Error("Invalid Column Name.");

    let pageNum = +req.params.pageNum; 
    let numberOfActivities = await res.locals.store.getActivityCount(); 
    let numberOfPages = Math.ceil(numberOfActivities / MAX_ACTIVITIES_PER_PAGE);

    if (!isValidPageNum(pageNum, numberOfPages)) throw new Error("Invalid Page Number.");

    let currentSortingColumn = res.locals.sortColumn;
    let currentSortingOrder = res.locals.sortAscend;

    // If is same column to sort on, switch sorting order only. 
    if (columnName === currentSortingColumn) {
      req.session.sortAscend = currentSortingOrder === "ASC" ? "DESC" : "ASC";
    } else {
      req.session.sortColumn = columnName;
      req.session.sortAscend = DEFAULT_SORT_ORDER;
    }

    res.redirect(`/activities/page/${pageNum}`);
  })
);

// GET: Render the sign in page.
app.get("/users/signin", (req, res) => {
  res.render("signin");
});

// POST: Handle sign in form submission
app.post("/users/signin",
  catchError(async (req, res) => {
    let username = req.body.username.trim();
    let password = req.body.password;

    let authenticated = await res.locals.store.authenticate(username, password);
    if (!authenticated) {
      req.flash("error", "Invalid credentials.");
      res.render("signin", {
        username,
        flash: req.flash(),
      });
    } else {
      req.session.username = username;
      req.session.signedIn = true;
      req.session.password = password; 

      req.flash("info", "Welcome!");

      // If a user is logging in directly from the sign-in page, will redirect to the main page. 
      // If user had previously tried to access a specific path, after signing in successfully, redirect them to that path.
      // This specific design choice is done in response to the following directions:
      // "...Suppose a user enters a URL for a page without first logging in. In that case, you should first require authentication, then proceed to the requested page..."
      if (res.locals.path) {
        delete req.session.path; 
        res.redirect(res.locals.path);
      } else {
        res.redirect("/activities/page/1");
      }
    }
  })
);

// POST: handle sign out 
// Don't delete session data on sort column and order so that we 
// retain the current sort order for the next sign in.
app.post("/users/signout", (req, res) => {
  delete req.session.username;
  delete req.session.signedIn;
  delete req.session.password; 

  res.redirect("/users/signin");
});

// GET: create a new account
app.get("/users/create-account", (req, res) => {
  res.render("create-account");
});

// POST: create a new account
app.post("/users/create-account",
  [
    body("username")
      .trim()
      .notEmpty()
      .withMessage("Username cannot be empty.")
      .bail()
      .custom(username => {
        const usernameRegex = /^[a-z0-9]+$/gi;
        return usernameRegex.test(username);
      })
      .withMessage("Username can only contain alphanumeric characters."),


    body("password")
    .notEmpty()
    .withMessage("Password cannot be empty."),

  ],
  catchError(async (req, res) => {
    let errors = validationResult(req);
    let {username, password} = req.body;

    const rerenderCreateAccount = () => {
      res.render("create-account", {
        username,
        flash: req.flash(),
      });
    };

    // Use try/catch in order to account for potential race consider; another user tries to create an account with the same username just before our user gets to.
    try {
      if (!errors.isEmpty()) {
        errors.array().forEach(message => req.flash("error", message.msg));
        rerenderCreateAccount();
      } else {
        let taken = await res.locals.store.checkIfUsernameExists(username);
        if (taken) {
          req.flash("error", "Sorry, this username is already taken. Please try again");
          rerenderCreateAccount();
        } else {
          let created = await res.locals.store.createAccount(username, password);
          if (!created) throw new Error("Unable to create the account");

          req.session.username = username;
          req.session.password = password;
          req.session.signedIn = true;
          res.render("success-create-account")
        }
      }
    } catch (error) {
      if (res.locals.store.isUniqueConstraintViolation(error)) {
        req.flash("error", "The username is taken. Please try again.");
        rerenderCreateAccount();
      } else {
        throw error;
      }
    }

  })
);

// POST: Delete the account.
app.post("/users/delete",
  requiresAuthentication,
  catchError(async (req, res) => {
    let deleted = await res.locals.store.deleteAccount(); 
    if (!deleted) throw new Error("Not found.");

    delete req.session.username;
    delete req.session.signedIn;

    req.flash("success", "Your account was successfully deleted.");
    res.redirect("/users/signin");

  })
);

// GET: Edit account username and/or password
app.get("/users/edit-account", 
  requiresAuthentication,
  (req, res) => {
    let [newUsername, newPassword] = res.locals.store.getAccountInfo(); 

    res.render("edit-account", {
      newUsername,
      newPassword,
    });
  }
);

// POST: Edit account username and/or password
app.post("/users/edit-account", 
  requiresAuthentication,
  [
    body("newUsername")
      .trim()
      .notEmpty()
      .withMessage("Username cannot be empty.")
      .bail()
      .custom(username => {
        const usernameRegex = /^[a-z0-9]+$/gi;
        return usernameRegex.test(username);
      })
      .withMessage("Username can only contain alphanumeric characters."),


    body("newPassword")
    .notEmpty()
    .withMessage("Password cannot be empty."),

  ],
  catchError(async (req, res) => {
    let errors = validationResult(req);
    let {newUsername, newPassword} = req.body;

    const rerenderEditAccount = () => {
      res.render("edit-account", {
        newUsername,
        newPassword,
        flash: req.flash(),
      });
    };

    // Use try/catch in order to account for potential race consider; another user tries to create/edit an account with the same username just before our user gets to.
    try {
      if (!errors.isEmpty()) {
        errors.array().forEach(message => req.flash("error", message.msg));
        rerenderEditAccount();
      } else {

        // If is same account 
        if (res.locals.store.isSameAccount(newUsername, newPassword)) {
          req.flash("info", "No edits were made.");
          res.redirect("/activities/page/1");
        } else {
          let updated = await res.locals.store.updateAccount(newUsername, newPassword);
          if (!updated) throw new Error("Unable to update the account");

          req.session.username = newUsername;
          req.session.password = newPassword;

          req.flash("success", "The account info has been changed.");
          res.redirect("/activities/page/1");
        }
      }
    } catch (error) {
      if (res.locals.store.isUniqueConstraintViolation(error)) {
        req.flash("error", "The username is taken. Please try again.");
        rerenderEditAccount();
      } else {
        throw error;
      }
    }
  })
);

// If user tries to access an unknown path, use middleware to go to error handler. Use wildcard `*`
app.all("*", (req, res, next) => {
  next(new Error("Cannot get this path."));
});

// Error handler (render a custom view for errors)
app.use((err, req, res, next) => {
  console.log(err);
  res.status(404).render("error", {
    err
  });
});

// Listener
app.listen(port, host, () => {
  console.log(`Activity Tracker is listening on port ${port} of ${host}!`);
});
