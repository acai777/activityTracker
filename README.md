
# Activity Tracker

Hello! Welcome to Activity Tracker, a very simple application that logs your activities. 

## Installation and Logistics
Let's start off with some info on how to run the application and what versions of what were used:

`node` version: v16.15.1 <br />
Browser used to test app: Version 115.0.5790.170 (Official Build) (arm64) <br />
PostgreSQL version: 8.11.2

To install, configure, and run the application: 

1. First, in the project root directory, run `npm install` <br />
2. Create a database called `activity_tracker` within PostgreSQL <br />
3. From the project root directory, on the command line, run the following three commands to get the seed data:

```bash
psql -d activity_tracker < schema.sql
psql -d activity_tracker < ./lib/users.sql
psql -d activity_tracker < ./lib/seed-data.sql
```

Once you have run the above three commands, you can then run `npm start` on the command line, and go to the URL `http://localhost:3000/` to go to the web application. 

Keep in mind that I have seed-data, and that there is a log-in feature. Both `users.sql` and `seed-data.sql` contain seed-data. In it, there are two currently registered users. The accounts' passwords are hashed in the files, however if you would like to access them, here are the usernames and decrypted passwords (same from the JS185 course exercises):

```
username: admin
password: secret

username: developer
password: letmein
```

## What is Activity Tracker?
Activity Tracker is a simple web application that logs your activities. Once users are signed in, they are able to add activities. With each activity, users must provide a title or name for the activity, a category the activity belongs to, the date associated with the activity, and the time spent on the activity (in minutes). Activities that have been logged will be shown on the resulting table. 

Though very simple, Activity Tracker does provide basic features. For activities that are submitted, the user can edit them, and the user can also delete them. The table is automatically sorted by the activity name (in ascending order), however users can sort on any of the columns present (e.g., category, date, time spent on the activity), and in the reverse direction. You just need to click on the table header you want to sort on.

Activities are limited to five per page. Once there are more activities, there is a pagination feature where remaining activities can be accessed on the second page, and so on. 

The activities logged are personal to the user and user only. This means we have also implemented basic authentication; users must be signed in in order to view their specific activities. There is also a link at the bottom of the main page which allows the user to delete their account (no warnings will be issued, and the change will be applied immediately). If a browser accesses the server for the first time and does not have an account, there is an option to create an account. Once created, users will be shown a page (with an image of a cat giving a thumbs up) indicating that the account has been successfully created, and then be prompted to go to their home page to start adding activities. 

Lastly, it should be also be that we have implemented a basic error handler. Any errors will prompt the server to display an error page with a cat image and a basic error message, indicating a HTTP 404 response code. If users try to access a path which does not exist, they will be directed to this error page. 

## Further information on the code implementation
I hope the files, particularly `activity-tracker.js` and `pg-persistence.js`, will be readable and that the code will be easy to follow along. I added comments in the files where I think some explanation would be helpful. Still, there might be remaining areas that seem overly convoluted, or prompt questions such as "Why was this done this way?" In anticipation of such questions, I've included some info on the implementation below:

1. For each HTTP request, we extract session info. As seen from JS185, we do so primarily to 1) extract flash messages from the session store, so that they will properly render through the `res.redirect()` method calls, and 2) to extract info on whether the user is logged in. In Activity Tracker, on top of the above, I also extract info on the sorting column, the sort order (ascend or descend), and the last URL the user might have requested. <br /><br />I extract info on the sort column and order so that the table of logged activities will remember and use the same sort column and order from the previous HTTP response/request cycle. I extract info on the the last URL the user might have requested such that, once the user is logged in, they will be redirected to the page they previously tried to enter. 

2. The HTML and CSS used in this app are fairly unimpressive and lacking, to say the least. In particular, for the pagination feature, I decided to implement the navigation bar of the page number using an HTML table, with `<a>` tags inside the table cells to direct to the intended page. The current page is highlighted in yellow. This might be a questionable choice, particularly if a user adds a lot of activities; the table rows might overflow and become unwieldy. More on this below. 

3. For any submissions the user makes to the server (e.g., adding a new activity, creating an account, signing in, editing an existing activity, etc), there are basic validations in place. All fields have SOME criteria for what is acceptable, and error messages will be displayed if an invalid input is received. However, it should be noted that some of these validations are quite lacking, and would not be acceptable in an actual application. For example when users create an account, I only require that the password is non-empty. I don't provide any other restrictions, such as enforcing the password to be at least a certain length, or to contain certain characters. The validations I enforce should hopefully be clear from `activity-tracker.js`


4. I made it such that the table of logged activities is, by default, sorting in ascending order and on the column indicating the name of the activity. There are, however, options that allow users to sort on other tables, and in descending order. **In retrospect, while I enjoyed implementing this feature and am glad I chose to do so, this feature most certainly added complexity to the code.** <br /><br />In particular, in the `pg-persistence.js` file, you will notice that the `loadSortedActivities` function (which retrieves a sorted list of the activities), is a bit complicated. Because I allow for sorting on multiple columns of different data types (e.g., date, text, integer), I needed to account for that in the code. I wanted the `title` and `category` columns to be sorted case-insensitive, so I first check to see if we are sorting on those columns. Furthermore, I also learned that you cannot do something like `ORDER BY $1`; as noted on the `pg` documentation, "PostgreSQL does not support parameters for identifiers." As such, I opted to use string concatentation to resolve the issue. 

5. For the forms asking for date info, I had some issues displaying the date properly (for when we want the `<input>` tag with the `date` type to redisplay the previously submitted date). After some Googling and testing, it seems like the reason is due to the date format coming out of the SQL queries. Re-formatting the date variable into a `MM/DD/YYYY` format allowed the date to be properly displayed. This is why, in `pg-persistence.js`, you will see I use the `TO_CHAR()` function to re-formate date values. 

6. When users attempt to create an account, there is a potential race condition; another user might, at the same time, try to create an account with the same username! If this happened, an error would be thrown, and the error message from the SQL query (of attempting to insert into the `users` table the duplicate username) would be displayed. Since we don't want this happening (a SQL error message would reveal more info to the user than we'd like), I employed a `try/catch` block in the route that handles account creation. Since this is a project for the JS189 assessment, it is very unlikely such an app would be deployed and be used by multiple users; it is unlikely we would ever run into this race condition. For the sake of completion, though, I decided to still go ahead and implement the `try/catch` block to account for the potential issue. This adds complexity to the code. 

7. Functions in `pg-persistence.js` are organized in alphabetical order. 

## Final thoughts 
1. As mentioned briefly above, when it comes to HTML and CSS, this project is very lacking. Furthermore, I don't even think I used some of the HTML in a semantically correct way. For example, with the pagination feature, I used a `table` element to create the links to the other pages (I don't think this is a proper use of the `table` element). If I were to redo this project, I would definitely familiarize myself with HTML and CSS, and revamp the HTML/CSS. 

2. I think I might've definitely gone a bit overboard with some of the features I implemented (e.g., sorting on all possible columns, feature to allow users to create an account, etc). In retrospect, while this was fun (and I learned a lot), this does add complexity to the application. I apologize if this makes it more difficult to grade. If anything is confusing, please let me know - happy to try and explain. 

3. Overall, there is some redundancy in the code. Certain areas have code that could maybe be extrapolated into a separate function/module. Furthermore, in the pug files, some views are rather similar (e.g., `add-activity.pug` and `edit-activity.pug`). if I were to go back and redo this project, I might try to reduce the redundancy and extrapolate methods that are reused. 