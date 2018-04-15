
## Packages Used
- Javascript / NodeJS.
- underscore.js for HTML templates.  The substitutions are in handlebars format.
- expressJS in service.js http server.

## Run using node
Developed using Node v8.11.1 and NPM v5.6.0 on MacOS.  Download at [npmjs.com](https://www.npmjs.com/get-npm).

```
npm install
PORT=8080 node generator/service.js
```

## Debug using WebStorm

The [WebStorm IDE](https://www.jetbrains.com/webstorm/) from Jetbrains is pretty good for Javascript debugging.
You can open the diwebapp directory as a project.  Open generator/gendisched.js to view code and set breakpoints.  Such as in generate() function.

Click 'Run/Debug...' from menu.  Create a new 'Node.js' configuration to run either service.js or gendisched.js.  If running the service.js, you may want to configure the environment variables, adding HOST=8080.  Otherwise, the service defaults to port 80, and you need elevated privileges.
