var secret_token = "abda9f970ff3c57131886df93fde6386066c8a73";

var GitHubApi = require("github"),
    Q = require('q'),
    express = require('express'),
    https = require('https');

var app = express();
app.set('port', process.env.PORT || 4000);
app.set('views', __dirname + '/views');
app.set('view engine', 'hjs');
app.use(express.favicon());
app.use(express.bodyParser());
app.use(express.static('./public'));
app.use(app.router);

app.configure('development', function() {
    app.use(express.errorHandler());
    app.use(express.logger('dev'));
});


var github = new GitHubApi({
    version: "3.0.0",
});

github.authenticate({
    type: "oauth",
    token: secret_token
});


Date.prototype.addDays = function(days) {
    var dat = new Date(this.valueOf());
    dat.setDate(dat.getDate() + days);
    return dat;
}
Date.prototype.getGenericDate = function() {
    var dat = new Date(this.valueOf());
    outputDate = dat.getFullYear() + "/" + (dat.getMonth() + 1) + "/" + dat.getDate();
    return outputDate;
}

function getDates(startDate, stopDate) {
    var dateArray = new Array();
    var currentDate = startDate;
    while (currentDate <= stopDate) {
        dateArray.push(currentDate)
        currentDate = currentDate.addDays(1);
    }
    return dateArray;
}

getGitHubData = function(user, repo) {
    var deferred = Q.defer()
    var getCommits =
        function(page, length, tmpCommitList, committersList, callback) {
            github.repos.getCommits({
                user: user,
                repo: repo,
                per_page: length,
                sha: page
            }, function(err, data) {
                if (err) {
                    deferred.reject(err.message)
                }
                var SHAList = [];

                function loop(promise, fn) {
                    return promise.then(fn).then(function(wrapper) {
                        return !wrapper.done ? loop(Q(wrapper.value), fn) : wrapper.value;
                    });
                }
                loop(Q.resolve(1), function(attribute) {
                    //console.log(attribute);
                    // console.log(attribute);
                    if (attribute == 1) {
                        // debugger;
                        //console.log(typeof data);
                    }
                    if (typeof data != "undefined") {
                        if ((typeof data[attribute] != "undefined")) {
                            //console.log(data[attribute]);
                            SHAList.push(data[attribute]["sha"])
                            var email = data[attribute]["commit"]["author"]["email"].replace('@', 'AT');
                            email = email.replace(/\./g, "DOT")
                            if (!(committersList.indexOf(email) >= 0)) {
                                committersList.push(email);
                            }
                            var rawDateTime = data[attribute]["commit"]["author"]["date"];
                            //console.log(email)
                            var JSDateTime = new Date(Date.parse(rawDateTime));
                            var dateTime = JSDateTime.getGenericDate();
                            if (tmpCommitList[dateTime]) {
                                tmpCommitList[dateTime].push({
                                    email: email,
                                    sha: data[attribute]["sha"]
                                });
                            } else {
                                tmpCommitList[dateTime] = [{
                                    email: email,
                                    sha: data[attribute]["sha"]
                                }]
                            }
                        }
                    }
                    return {
                        done: attribute > data.length,
                        value: ++attribute
                    };
                }).done(function() {
                    // debugger;
                    callback(tmpCommitList, SHAList, committersList);

                });

            })
    }

    getCommits('', 100, {}, [], function(commits, SHAList1, committersList) {
        var getCommitsDone = function(page, length, commits, SHAList2, committersList, callback) {

            if (SHAList2.length < length - 5) {
                callback(commits, SHAList2, committersList);
            } else {
                getCommits(SHAList2.slice(-1)[0], 100, commits, committersList, function(commitsList, SHAList3, committersList) {
                    getCommitsDone(SHAList3.slice(-1)[0], 100, commitsList, SHAList3, committersList, callback);
                })
            }
        };

        getCommitsDone(SHAList1.slice(-1)[0], 100, commits, SHAList1, committersList, function(commitsList, SHAList4, committersList) {
            uglyCommitsObj = {};
            committersList.forEach(function(each) {
                uglyCommitsObj[each] = []
            });
            fullDatesList = getDates(new Date(Object.keys(commitsList).slice(-1)[0]), new Date());
            fullDatesList.forEach(function(each) {
                Object.keys(uglyCommitsObj).forEach(function(committer) {
                    shortList = [each.getGenericDate(), 0]
                    uglyCommitsObj[committer].push(shortList)
                })
                if (typeof commitsList[each.getGenericDate()] != "undefined") {
                    commitsList[each.getGenericDate()].forEach(function(record) {
                        uglyCommitsObj[record.email].forEach(function(item) {
                            if (item[0] == each.getGenericDate()) {
                                index = uglyCommitsObj[record.email].indexOf(item)
                                uglyCommitsObj[record.email][index][1] = uglyCommitsObj[record.email][index][1] + 1
                            }
                        })

                    });

                }
            })
            returnList = []
            Object.keys(uglyCommitsObj).forEach(function(committer) {
                returnList.push({
                    key: committer,
                    value: JSON.stringify(uglyCommitsObj[committer])
                })

            })
            // console.log(committersList)
            deferred.resolve([returnList, committersList]);
        })
    });
    return deferred.promise;
}


app.get('/', function(req, res) {

    if (req.query.user && req.query.repo) {
        var check = https.get("https://github.com/" + req.query.user + "/" + req.query.repo, function(response) {
            console.log(response.statusCode)
            if(response.statusCode ===200){

            var name = req.query.user.replace(/\s/g, ''),
                repo = req.query.repo.replace(/\s/g, ''),
                promises = [],
                promise;


            promises = getGitHubData(name, repo);
            promise = Q.allSettled(promises);

            promise.then(function(results) {
                var returning = results[0].value,
                    validNames = results[1].value;
                res.render('index', {
                    calendarData: returning,
                    names: validNames,
                    anyValidNames: validNames.length > 0,
                    namesString: validNames.join(','),
                    repoString: repo,
                    nameString: name,
                    embeddable: req.query.embeddable,
                    playbutton: req.query.playbutton
                });
            }).fail(function() {
                res.render('index');
            });
             }else{res.render('index');}
        }).on('error', function(e) {
            res.render('index')
        })
        // response.end()



    } else {
        res.render('index');
    }

});

app.listen(app.get('port'));
console.log('Express server listening on port ' + app.get('port'));
