/**
 * Code Editor for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
require.def("ext/debugger/debugger",
    ["core/ide",
     "core/ext",
     "ext/console/console",
     "ext/filesystem/filesystem",
     "ext/noderunner/noderunner",
     "text!ext/debugger/debugger.xml"],
    function(ide, ext, log, fs, noderunner, markup) {

return ext.register("ext/debugger/debugger", {
    name   : "Debug",
    dev    : "Ajax.org",
    type   : ext.GENERAL,
    alone  : true,
    markup : markup,
    deps   : [log, fs],

    nodes : [],

    hook : function(){
        this.$layoutItem = mnuModes.appendChild(new apf.item({
            value   : "ext/debugger/debugger",
            caption : this.name
        }));
    },

    init : function(amlNode){
        this.rightPane = ide.vbMain.selectSingleNode("a:hbox/a:vbox[3]");
        this.nodes.push(
            //Append the stack window at the right
            this.rightPane.appendChild(winDbgStack),

            //Append the variable window on the right
            this.rightPane.appendChild(winDbgVariables),

            //Append the variable window on the right
            this.rightPane.appendChild(winDbgBreakpoints)
        );

        this.paths = {};
        var _self = this;
        mdlDbgSources.addEventListener("afterload", function() {
            _self.$syncTree();
        });
        mdlDbgSources.addEventListener("update", function(e) {
            if (e.action != "add")
                return;
            // TODO: optimize this!
            _self.$syncTree();
        });
        fs.model.addEventListener("update", function(e) {
            if (e.action != "insert")
                return;
            // TODO: optimize this!
            _self.$syncTree();
        });
        //@todo move this to noderunner...
        dbg.addEventListener("changeframe", function(e) {
            e.data && _self.$showFile(e.data.getAttribute("scriptid"));
        });

        lstBreakpoints.addEventListener("afterselect", function(e) {
            if (e.selected && e.selected.getAttribute("scriptid"))
                _self.$showFile(e.selected.getAttribute("scriptid"), parseInt(e.selected.getAttribute("line")) + 1);
            // TODO sometimes we don't have a scriptID
        });

        log.enable(true);
    },

    $showFile : function(scriptId, line, text) {
        var file = fs.model.queryNode("//file[@scriptid='" + scriptId + "']");

        if (line !== undefined) {
            ide.addEventListener("afteropenfile", function(e) {
                if (e.node.getAttribute("scriptid") == scriptId) {
                    ide.removeEventListener("afteropenfile", arguments.callee);
                    setTimeout(function() {
                        ceEditor.$editor.gotoLine(line);
                        if (text)
                            ceEditor.$editor.find(text);
                        ceEditor.focus();
                    }, 30);
                }
            });
        }

        if (file) {
            ide.dispatchEvent("openfile", {
                node: file
            });
        } else {
            var script = mdlDbgSources.queryNode("//file[@scriptid='" + scriptId + "']");
            var name = script.getAttribute("scriptname");
            var chunks = name.split("/");
            var value = chunks[chunks.length-1];

            // TODO this has to be refactored to support multiple tabs
            var page = tabEditors.getPage(value);
            if (page) {
                tabEditors.set(page);
            }
            else if (name.indexOf(noderunner.workspaceDir) == 0) {
                var path = noderunner.davPrefix + "/" + name.slice(noderunner.workspaceDir.length);
                var node = apf.n("<file />")
                    .attr("name", name)
                    .attr("path", path)
                    .attr("contenttype", "application/javascript")
                    .attr("scriptid", script.getAttribute("scriptid"))
                    .attr("scriptname", script.getAttribute("scriptname"))
                    .attr("lineoffset", "0").node();

                ide.dispatchEvent("openfile", { node: node });
            }
            else {
                var node = apf.n("<file />")
                    .attr("name", value)
                    .attr("path", name)
                    .attr("contenttype", "application/javascript")
                    .attr("scriptid", script.getAttribute("scriptid"))
                    .attr("scriptname", script.getAttribute("scriptname"))
                    .attr("debug", "1")
                    .attr("lineoffset", "0").node();

                dbg.loadScript(script, function(source) {
                    var doc = node.ownerDocument;
                    var data = doc.createElement("data");
                    data.appendChild(doc.createTextNode(source));
                    node.appendChild(data);

                    ide.dispatchEvent("openfile", { node: node });
                });
            }
        }
    },

    count : 0,
    $syncTree : function() {
        if (this.inSync) return
        this.inSync = true;

        var dbgFiles = mdlDbgSources.data.childNodes;

        var workspaceDir = noderunner.workspaceDir;
        for (var i=0,l=dbgFiles.length; i<l; i++) {
            var dbgFile = dbgFiles[i];
            var name = dbgFile.getAttribute("scriptname");
            if (name.indexOf(workspaceDir) != 0)
                continue;
            var path = name.slice(workspaceDir.length+1);
            this.paths[path] = dbgFile;
        }
        var treeFiles = fs.model.data.getElementsByTagName("file");
        var tabFiles = tabEditors.getPages().map(function(page) {
            return page.$model.data;
        });
        var files = tabFiles.concat(Array.prototype.slice.call(treeFiles, 0));

        var davPrefix = noderunner.davPrefix;
        for (var i=0,l=files.length; i<l; i++) {
            var file = files[i];
            var path = file.getAttribute("path").slice(davPrefix.length);

            var dbgFile = this.paths[path];
            if (dbgFile) {
                apf.b(file).attr("scriptid", dbgFile.getAttribute("scriptid"));
                apf.n(file)
                    .attr("scriptname", dbgFile.getAttribute("scriptname"))
                    .attr("lineoffset", "0");
            }
        }
        this.inSync = false;
    },

    enable : function(){
        this.nodes.each(function(item){
            if (item.show)
                item.show();
        });
        this.rightPane.setProperty("visible", true);
        log.enable(true);

        //Quick Fix
        if (apf.isGecko)
            apf.layout.forceResize(ide.vbMain.$ext);
    },

    disable : function(){
        this.nodes.each(function(item){
            if (item.hide)
                item.hide();
        });
        this.rightPane.setProperty("visible", false);
        log.disable(true);

        //Quick Fix
        if (apf.isGecko)
            apf.layout.forceResize(ide.vbMain.$ext);
    },

    destroy : function(){
        this.nodes.each(function(item){
            item.destroy(true, true);
        });
        winV8.destroy(true, true);
        this.$layoutItem.destroy(true, true);

        this.nodes = [];
    }
});

});