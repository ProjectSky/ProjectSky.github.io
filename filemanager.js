"use strict";
const path_prefix = "translations/texts"

function FileManager(holder, navigator, account, on_file)
{
  this.holder = holder
  this.navigator = navigator
  this.table = {}
  this.table = document.createElement('table')
  this.table.className = "table table-responsive table-hover"
  this.table.id = holder.id + "-fmtree"
  this.table.createTBody()
  this.holder.appendChild(this.table)
  this.account = account
  this.on_file = on_file
}


FileManager.prototype.addFile = function(name, type, on_click)
{
  var row = this.table.insertRow()
  var img = row.insertCell()
  var glyph = {
    "dir": "folder-open",
    "file": "list-alt",
    "up": "level-up"
  }
  img.innerHTML = "<span class='glyphicon glyphicon-" + glyph[type] + "'></span>"
  img.className = "img-responsive"
  img.style.width = 16
  var link = row.insertCell()
  link.className = "container"
  var completion = row.insertCell()

  var complindicator = document.createElement('div')
  var complframe = document.createElement('div')
  complframe.style["margin-bottom"] = 0
  complframe.className = 'progress'
  complindicator.className = 'progress-bar progress-bar-success'
  complindicator.id = this.holder.id + "-progress-" + name.replace(/[\s\./]/g, '-')
  complindicator.setAttribute('role', 'progressbar')
  complindicator.setAttribute('aria-valuemin', 0)
  complindicator.setAttribute('aria-valuemax', 100)
  complindicator.setAttribute('aria-valuenow', 0)
  complindicator.style.width =  "0%"
  complframe.appendChild(complindicator)
  completion.appendChild(complframe)

  completion.className = 'container'

  var thelink = document.createElement('a')
  thelink.className = ""
  thelink.title = name
  thelink.innerHTML = name
  row.onclick = on_click

  link.appendChild(thelink)
  return complindicator.id
}



FileManager.prototype.track = function(path)
{
  let fm = this
  let parts = path.slice(path_prefix.length).split('/')
  let curparts = $(this.navigator).children().toArray()
  function makeLink(thepath, i)
  {
    let offset = path_prefix.length
    for (let k=i;k >= 0;k--)
      offset = thepath.indexOf('/', offset) + 1
    if (offset == 0)
      offset = thepath.length
    let reduced = thepath.slice(0, offset)
    return function()
    {
      fm.gotoPath(reduced)
    }
  }
  for (let i in parts)
  {
    if (parts[i].length == 0)
      parts[i] = '根目录'
    if (curparts.length <= i)
    {
      $(this.navigator).append('<li>'+parts[i]+'</li>').children().last()
        .on('click', makeLink(path, i))
      continue
    }
    if ($(curparts[i]).text() != parts[i])
      $(curparts[i]).text(parts[i])

    $(curparts[i]).removeClass('active')
  }
  $(this.navigator).children().slice(parts.length).remove()
  $(this.navigator).children().last().addClass('active')
}

FileManager.prototype.updateTree = function (file_json, path)
{
  var fm = this
  if (path.length > 0)
  {
    this.track(path)
  }
  var offset = path.lastIndexOf("/")
  if (offset >= path_prefix.length - 1)
  {
    var prev_path = path.slice(0,offset)
    offset = path.lastIndexOf("?")
    if (offset != -1)
    {
      prev_path = prev_path + path.slice(offset)
    }
    fm.addFile( "..", "up",function()
      {
        fm.gotoPath(prev_path)
      })
  }
  $.each(file_json, function(i, e)
    {
      if (e.size >= 1024000)
      {return}
      let pbid = fm.addFile(e.name, e.type, function()
        {
          fm.gotoPath(e.path)
        })
      theWorker.justSend("getstatus", {id:pbid, path:e.path})
    })
}

FileManager.prototype.gotoPath = function (path)
{
  var fm = this
  if (!this.account)
  {
    this.on_file(path)
    return
  }
  this.account.getJSON(this.account.get_repo_suffix() + "contents/" + path + '?ref=' +
    this.account.branch).then(
    function(json){
      if (!($.isArray(json)))
      {
        fm.on_file(json)
        return
      }
      $(fm.table).find('tbody').html('')
      fm.updateTree(json, path)
    })
}

FileManager.prototype.gotoHome = function ()
{
  this.gotoPath(path_prefix)
}


