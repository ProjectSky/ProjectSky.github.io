"use strict";
const api_prefix = "https://api.github.com/"

function setAuthData(xhr, authdata)
{
  if (authdata.uname && authdata.upass)
  {
    xhr.setRequestHeader ("Authorization", "Basic " +
      btoa(authdata.uname + ":" + authdata.upass));
  }
}

function GHAccount(authdata, owner, repo, branch, holder)
{
  this.authdata = authdata
  this.owner = owner
  if (holder) {
    this.targetholder = holder
  }
  else {
    this.targetholder = owner
  }
  this.repo = repo
  this.branch = branch
}

GHAccount.prototype.rawRequest = function(url, type, data, onprogress)
{
  let acc = this
  let result = new Promise( function(ok, fail)
  {
    let ajax = new XMLHttpRequest()
    ajax.open(type, api_prefix + url, true)
    ajax.onerror = function(stat) {fail(ajax, stat, "连接错误！")}
    if (typeof onprogress == "function")
      ajax.onprogress = function(pe)
      {
        if (pe.lengthComputable)
          onprogress(pe.loaded/pe.total)
        else
          onprogress(1)
      }
    ajax.onload = function () {
      if (ajax.status >= 400)
        fail(ajax, ajax.status, ajax.response)
      else
        ok(ajax.response);
    };
    setAuthData(ajax, acc.authdata)
    ajax.send(data);
  })
  return result
}
GHAccount.prototype.request = function(url, type, data, onprogress)
{
  let result = this.rawRequest(url, type, data, onprogress)
  return result.then(function(answer){return JSON.parse(answer)})
}

GHAccount.prototype.check_authdata = function (authdata, on_success, on_fail)
{
  var acc = this
  acc.authdata = authdata
  let authed = acc.request("user", "GET", {})
  authed.then(on_success).catch(function(a)
  {
    acc.authdata = {}
    on_fail(a)
  })
}

GHAccount.prototype.get_repo_suffix = function()
{
  return "repos/" + this.targetholder + '/' + this.repo + '/'
}

GHAccount.prototype.ifNotAMember = function ()
{
  let acc = this
  let url = "orgs/" + acc.owner + "/members/" + acc.authdata.uname
  return new Promise(function(ok, fail) {
    //acc.rawRequest(url, "GET", {}).catch(ok).then(function(){})
  })
}

GHAccount.prototype.ifHasFork = function()
{
  let acc = this
  let url = "repos/" + acc.authdata.uname + '/' + acc.repo
  return new Promise(function(ok, fail){
    console.log("in promise")
    acc.request(url, "GET", {}).then(function(a){
      console.log("in promise resolve")
      console.log(a)
      if (a.parent.full_name == acc.owner + '/' + acc.repo)
      {ok(a)}
      else{fail(a)}
    }).catch(fail)
  })
}

GHAccount.prototype.switchToFork = function()
{
  this.targetholder = this.authdata.uname
}

GHAccount.prototype.switchToMain = function()
{
  this.targetholder = this.owner
}

GHAccount.prototype.mergeFrom = function (head)
{
  let acc = this
  let url = acc.get_repo_suffix() + 'merges'
  let head_json_promise = acc.getHead()
  let data = {base: acc.branch, head: head}
  let result = acc.request(url, "POST", JSON.stringify(data))
  let new_head = result.then(function(commit){
    return acc.updateHead(commit.sha)
  })
  return Promise.resolve(new_head)
}

GHAccount.prototype.getHead = function(on_progress)
{
  return this.getJSON(this.get_repo_suffix() + "git/refs/heads/" +
    this.branch, {}, on_progress)
}

GHAccount.prototype.updateHead = function(sha, on_progress)
{
  this.request(this.get_repo_suffix() + "git/refs/heads/" +
    this.branch, "PATCH", JSON.stringify({sha:sha}), on_progress)

}

GHAccount.prototype.compareToOwner = function ()
{
  let acc = this
  let url = acc.get_repo_suffix() + 'compare/' + acc.owner +
    ":" + acc.branch + "..." + acc.authdata.uname + ":" + acc.branch
  return acc.request(url, "GET", {})
}

GHAccount.prototype.fork = function()
{
  let acc = this
  let url = acc.get_repo_suffix() + "forks"
  return acc.request(url, "POST", [])
}

GHAccount.prototype.getJSON = function (url, data, onprogress)
{
  return this.request(url, "GET", data, onprogress)
}

function make_tree_entry(path, string_content)
{
  return {
    path: path,
    mode: "100644",
    content: string_content,
    type: "blob"
  }
}

GHAccount.prototype.make_tree_blob = function (string_content)
{
  let prefix = "repos/" + this.repo
  let req = {
    content: string_content,
    encoding: "utf-8"
  }
  return this.request(prefix + "/git/blobs", "POST", JSON.stringify(req))
}

GHAccount.prototype.do_commit = function (msg, filetree, on_progress)
{
  let authdata = this.authdata
  let acc = this
  let commit_sha = ""
  let head_json_promise = acc.getHead(function(p){on_progress(20*p)})
  let commit_json_promise = head_json_promise.then(function(ref_json)
    {
      commit_sha = ref_json.object.sha
      on_progress(20)
      return acc.getJSON( acc.get_repo_suffix() + "git/commits/" + commit_sha, {},
      function(p){on_progress(20*p + 20)})
    })
  let new_tree_promise = Promise.resolve(commit_json_promise)
    .then(function(com_json)
    {
      let new_tree = {
        base_tree: com_json.tree.sha,
        tree: filetree
      }
      on_progress(40)
      return acc.request(acc.get_repo_suffix() + "git/trees", "POST",
        JSON.stringify(new_tree), function(p){on_progress(20*p + 40)})
    })
  let new_commit_promise = Promise.resolve(new_tree_promise).then(
    function(tree_json)
    {
      let commit_body = {
        message: msg,
        tree: tree_json.sha,
        parents: [commit_sha]
      }
      if (authdata.email)
      {
        commit_body.author = {name: authdata.uname, email: authdata.email}
        commit_body.commiter = {name: authdata.uname, email: authdata.email}
      }
      on_progress(60)
      return acc.request(acc.get_repo_suffix() + "git/commits", "POST",
        JSON.stringify(commit_body), function(p){on_progress(20*p + 60)})
    })
  let updated_head_promise = Promise.resolve(new_commit_promise).then(
    function(commit_json)
    {
      on_progress(80)
      return acc.updateHead(commit_json.sha, function(p){on_progress(20*p + 80)})
    })
  return updated_head_promise.then(function(upd_head)
  {
    on_progress(100);
    return upd_head
  })
}
