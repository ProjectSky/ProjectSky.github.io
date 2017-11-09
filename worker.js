"use strict";
importScripts("githubapi.js", "https://rawgit.com/dankogai/js-base64/master/base64.min.js")

var totalfiles = {}
var translatedfiles = {}
var substitutions = {}

const pathregex = /\/?([^\/]+)\/(.+)/

function sumUp(counter)
{
  let result = 0
  if (typeof counter == "number")
  {
    return counter
  }
  for (let f in counter)
  {
    result += sumUp(counter[f])
  }
  return result
}

function accessByPath(obj, path, newval)
{
  if (path.length == 0)
  {
    return obj
  }
  let ans = path.match(pathregex)
  if (!Array.isArray(ans))
  {
    if (typeof newval == "number")
    {
      obj[path] = newval
    }
    return obj[path]
  }
  let cur = ans[1]
  let tail = ans[2]
  return accessByPath(obj[cur], tail, newval)
}

function getByPath(obj, path)
{return accessByPath(obj, path)}

function setTranslated(msg)
{
  let path = msg.path.substring("translations/".length)
  let oldvalue = accessByPath(translatedfiles, path)
  if (oldvalue !== msg.value)
  {
    accessByPath(translatedfiles, path, msg.value)
    return {needed: true, json: translatedfiles}
  }
  else
    return {needed: false}
}

function handleStatus(data)
{
  let path = data.path.substring("translations/".length)
  let trs = sumUp(getByPath(translatedfiles, path))
  let value = trs * 100 / sumUp(getByPath(totalfiles, path))
  return {id: data.id, val: value}
}

function loadSubstitutions(acc, force)
{
  if (Object.keys(substitutions).length !== 0 && ! force)
    return Promise.resolve(substitutions)
  let result = new Promise(function(ok, fail){
    let ajax = new XMLHttpRequest()
    ajax.open("GET", 'https://rawgit.com/' + acc.owner + '/' +
        acc.repo + '/' + acc.branch + '/'+
        'translations/substitutions.json', true)
    ajax.onerror = fail
    ajax.onload = function () {
      if (ajax.status >= 400)
        fail(ajax.getAllResponseHeaders(), ajax.statusText, ajax.response)
      else
        ok(ajax.response);
    };
    ajax.send();
  })
  return result.then(function(answer)
  {
    substitutions = JSON.parse(answer);
    return substitutions
  })
}

function findInFiles(obj, prepath, pattern, callback)
{
  let results = []
  let sep = "/"
  if (prepath.length == 0)
    sep = ""
  for (let f in obj)
  {
    let newprepath = prepath + sep + f
    if (typeof obj[f] == "object")
      results = results.concat(findInFiles(obj[f], newprepath, pattern, callback))
    else if (newprepath.indexOf(pattern) >= 0)
    {
      results.push(newprepath)
      callback(newprepath)
    }
  }
  return results
}

function findPath(data, acc)
{
  let promised_substitutions = loadSubstitutions(acc)
  let results = findInFiles(totalfiles, "", data.pattern, function(p)
  {
    postMessage({name:"foundresult", msg: p})
  })
  promised_substitutions.then(function(subs)
  {
    for(let k in subs)
      if(k.indexOf(data.pattern) != -1)
        for (let i in subs[k])
          if (!results.includes(subs[k][i]))
          {
            results.push(subs[k][i])
            postMessage({name:"foundresult", msg: subs[k][i]})
          }
  }).catch(function(e){
    console.log(e)
  })
}

function findCode(data, acc)
{
  let req = encodeURI(data.pattern + " repo:" + acc.repo +
    " user:" + acc.owner +
    " path:translations/texts")

  let results = acc.getJSON("search/code?q="+req+"")
  results.then(function(answer){
    for (let i in answer.items)
    {
      postMessage({
        name:"foundresult",
        msg: answer.items[i].path.slice('translations/'.length)
      })
    }
  })
}

function refreshProgress(data, account)
{
  let thedate = new Date()
  let prefix = account.get_repo_suffix() + "contents/translations/"
  let postfix = "?ref="+account.branch+"&current_time=" + thedate.getTime()
  let totprom = account.getJSON(prefix + "totallabels.json"+postfix).then(
    function(prp_json){
      totalfiles = JSON.parse(Base64.decode(prp_json.content))
    })
  let trprom = account.getJSON(prefix + "translatedlabels.json"+postfix).then(
    function(prp_json){
      translatedfiles = JSON.parse(Base64.decode(prp_json.content))
    })
  return Promise.all([totprom, trprom])
}

const handlers = {
  "getstatus": handleStatus,
  "searchfilename": findPath,
  "searchcontent": findCode,
  "updatetranslated": setTranslated,
  "refreshprogress": refreshProgress
}

onmessage = function(msg)
{
  if (! handlers[msg.data.name])
    return
  let account = new GHAccount(msg.data.account.authdata,
    msg.data.account.owner, msg.data.account.repo,
    msg.data.account.branch, msg.data.account.targetholder)
  let result = handlers[msg.data.name](msg.data.msg, account)
  Promise.resolve(result).then(function(r)
  {
    postMessage({name: msg.data.name, msg: r})
  }).catch(function(e){console.log(e)})
}
