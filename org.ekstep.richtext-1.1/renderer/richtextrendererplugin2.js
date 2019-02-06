Plugin.extend({
    _type: 'org.ekstep.text',
    _isContainer: true,
    _render: true,
    _plginConfig: {},
    _plginData: {},
    _plginAttributes: {},
    initPlugin: function(data) {
        var instance = this;
        this._plginConfig = JSON.parse(data.config.__cdata);
        if(!_.isUndefined(data.data))
            this._plginData = JSON.parse(data.data.__cdata);

        var pid = data._id || data.id;
        if(data.id) {
            data._id = pid;
            delete data.id;
        }
        this.id = _.uniqueId('org.ekstep.text');
        this._data = data;
        var data = _.clone(this._data);
        data.id = pid;
        data.__text = _.isUndefined(this._plginConfig.text) ? data.__text : this._plginConfig.text;
        //PluginManager.invoke('text', data, instance._parent, instance._stage, instance._theme);
        var dims = this.relativeDims();
        var div = document.getElementById(data.id);
        if (div) {
            jQuery("#" + data.id).remove();
        }
        div = document.createElement('div');
        if (data.style)
            div.setAttribute("style", data.style);
        div.id = data.id;
        div.classList.add('richText');
        var fontSize = this.updateFontSize(parseFloat(data.fontSize));
        div.style.fontSize = fontSize + 'px';
        div.style.fontFamily = data.font;
        if(this._plginConfig.showBorders || data.showBorders) {
            div.style.width = dims.w + 'px';
            div.style.height = dims.h + 'px';
        } else {
            div.style.width = dims.w + 10 + 'px';
            div.style.height = dims.h + 5 + 'px';
        }
  
        div.style.position = 'absolute';

        // div.style.fontWeight = this._plginConfig.fontweight ? "bold" : "normal";
        // div.style.fontStyle = this._plginConfig.fontstyle ?  "italic" : "normal";
        div.style.color = data.color;
       
        var parentDiv = document.getElementById(Renderer.divIds.gameArea);
        parentDiv.insertBefore(div, parentDiv.childNodes[0]);

        jQuery("#" + data.id).html(data.__text);
        this._div = div;
        this._self = new createjs.DOMElement(div);
        this._self.x = dims.x;
        this._self.y = dims.y;

        // if (data.type == 'rect') {
            div.style.padding = "1px 2px 0px";
            div.style.border = this._plginConfig.showBorders || data.showBorders? "solid 2px #5e5d5d" : "none";
            div.style.textAlign = data.align ? data.align : 'center';

        // } else {
        //     jQuery("#" + data.id).find('table > tbody > tr > td').css({'border': 'solid 1px #000', 'padding-left': '1px'});
        //     jQuery("#" + data.id).find('table > tbody > tr > th').css('border', 'solid 1px #000');
        //     jQuery("#" + data.id).find('table > thead > tr > th').css('border', 'solid 1px #000');
      
        // }
    },
    updateFontSize: function (initFontSize) {
        var canvas = EkstepRendererAPI.getCanvas();
        var canvasDim = {
            width: canvas.width,
            height: canvas.height,
        }
        // Convert fontSize to pixel based on device dimensions
        var exp = parseFloat(PluginManager.defaultResWidth * this.relativeDims().w / 100);
        var cw = this._parent.dimensions().w;
        var width = parseFloat(cw * this.relativeDims().w / 100);
        var scale = parseFloat(width / exp);
        fontsize = parseFloat(initFontSize * scale);
        return fontsize;
    }
});
//# sourceURL=newtextrenderer2.js