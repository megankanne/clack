// Problems
// Assumes the data is sorted.
// context name defaults to default everywhere
// Doesn't do multiple contexts yet

// Ideas
// Is this applicable: http://www.paulirish.com/2011/requestanimationframe-for-smart-animating/

var CLACK = CLACK || {};

CLACK.Context = function() {
  return {    
    domainAxis: undefined,
    domainScale: undefined,
    domainScaleType: 'linear',
    maxLength: undefined,
    minLength: undefined,
    rangeAxis: undefined,
    rangeScale: undefined,
    rangeScaleType: 'linear',
    series: [],
    xmax: -Infinity,
    xmin: Infinity,
    xrange: 0,
    ymax: -Infinity,
    ymin: Infinity,
    yrange: 0,
    markers: []
  }
}

// Make this an object…
CLACK.Chart = function(parent, options) {
  // XXX Make sure this is an object and give reasonable error messages.
  this.options = options || {};

  if(this.options['axes'] === undefined) {
    this.options['axes'] = true;
  }
  if(this.options['grids'] === undefined) {
    this.options['grids'] = true;
  }
  this.options['gridColor'] = this.options['gridColor'] || '#ccc';

  this.options['width'] = this.options['width'] || 500;
  this.options['height'] = this.options['height'] || 200;

  this.options['renderer'] = this.options['renderer'] || new CLACK.LineRenderer();

  // Clear the contents of the chart, destroying urthang.
  this.clear = function() {
    // This D3 handling seems hinky.
    this.d3shit = undefined;
    // Clean up the in memory stuff.
    this._memCtx = undefined;
    this._memElement = undefined;
    if(this.inner !== undefined) {
      $(this.inner).remove();
    }
    this.contexts = {
      default: new CLACK.Context()
    };
  }

  // Init some variables
  this.parent = parent;

  // Start things off clean.
  this.clear();

  this.inner = document.createElement('div');
  this.inner.className = 'clack-inner';
  this.inner.style.width = this.options.width + 'px';
  this.inner.style.height = this.options.height + 'px';
  parent.appendChild(this.inner);

  this.getCanvas = function() {
    // Add the chart canvas
    if(this._ctx === undefined) {
      this.element = document.createElement('canvas');
      this.element.style.position = 'absolute';
      // Only if the axes are here… XXX
      this.element.style.left = "40px";
      this.element.style.top = 0;
      this.element.width = this.options.width;
      this.element.height = this.options.height;
      this.element.style.zIndex = 0;
      this.inner.appendChild(this.element);
      this._ctx = this.element.getContext('2d');
    }
    return this._ctx;
  }

  this.getDecorationCanvas = function() {
    // Add the topmost "decoration" canvas
    if(this._decoCtx === undefined) {
      this.decoElement = document.createElement('canvas');
      this.decoElement.style.position = 'absolute';
      // Only if the axes are here… XXX
      this.decoElement.style.left = "40px";
      this.decoElement.style.top = 0;
      this.decoElement.width = this.options.width;
      this.decoElement.height = this.options.height;
      this.decoElement.style.zIndex = 1;
      this.inner.appendChild(this.decoElement);
      this._decoCtx = this.decoElement.getContext('2d');
    }
    return this._decoCtx;
  }

  this.getMemoryCanvas = function() {
    if(this._memCtx === undefined) {
      // Create an in-memory canvas!
      var memElement = this.getMemoryElement();
      this._memCtx = memElement.getContext('2d');
    }
    return this._memCtx;
  }

  this.getMemoryElement = function() {
    if(this._memElement === undefined) {
      this._memElement = document.createElement('canvas');
      this._memElement.width = this.options.width;
      this._memElement.height = this.options.height;
    }
    return this._memElement;
  }

  this.getContext = function(name) {
    return this.contexts[name];
  }

  this.addMarker = function(marker) {
    var ctx = this.contexts['default'];
    
    ctx.markers.push(marker);

    this.updateContext('default');
    return ctx.markers.length;
  }

  this.addSeries = function(series) {
    var ctx = this.contexts['default'];

    ctx.series.push(series);
    // Establish some defaults that can be later.
    series.xmax = -Infinity;
    series.xmin = Infinity;
    series.xrange = 0;
    series.ymax = -Infinity;
    series.ymin = Infinity;
    series.yrange = 0;
    var idx = ctx.series.length - 1;
    this.updateSeries('default', idx, series.x, series.y);
    return idx;
  }

  this.addToSeries = function(ctxName, index, exes, whys, replace) {
    var ctx = this.contexts[ctxName];

    series = ctx.series[index];

    if((exes instanceof Array) && (whys instanceof Array)) {
      series.x = series.x.concat(exes);
      series.y = series.y.concat(whys);
    }

    if(replace === true) {
      series.x = series.x.slice(exes.length);
      series.y = series.y.slice(whys.length);
    }

    this.updateSeries(ctxName, index, exes, whys);
  }

  // Update stats for the series.
  this.updateSeries = function(ctxName, index) {
    var ctx = this.contexts[ctxName];

    series = ctx.series[index];

    series.xmax = d3.max(series.x);
    series.xmin = d3.min(series.x)

    series.ymax = d3.max(series.y);
    series.ymin = d3.min(series.y);

    series.xrange = series.xmax - series.xmin;
    series.yrange = series.ymax - series.ymin;

    this.updateContext(ctxName);
  }

  // Update stats for the context.
  this.updateContext = function(ctxName) {
    var ctx = this.contexts[ctxName];

    // Iterate through each series, establishing the maxes of x and y.
    // Start with the values backwards so that min and max work.
    var xmax = -Infinity;
    var ymax = -Infinity;
    var xmin = Infinity;
    var ymin = Infinity;
    var maxLength = -Infinity;
    var minLength = Infinity;
    for(var i = 0; i < ctx.series.length; i++) {
      var s = ctx.series[i];
      // It is assumed that there are an equal number of xs and ys, but that's not
      // asserted anywhere. XXX
      maxLength = Math.max(maxLength, s.x.length);
      minLength = Math.min(minLength, s.x.length);
      xmax = Math.max(xmax, s.xmax);
      xmin = Math.min(xmin, s.xmin);
      ymax = Math.max(ymax, s.ymax);
      ymin = Math.min(ymin, s.ymin);
    }

    // Do the same for any markers.
    for(var i = 0; i < ctx.markers.length; i++) {
      var m = ctx.markers[i];
      if(m.x1 !== undefined) {
        xmin = Math.min(xmin, m.x1);
      }
      if(m.x2 !== undefined) {
        xmax = Math.max(xmax, m.x2);
      }
      if(m.y1 !== undefined) {
        ymin = Math.min(ymin, m.y1);
      }
      if(m.y2 !== undefined) {
        ymax = Math.max(ymax, m.y2);
      }
    }

    ctx.maxLength = maxLength;
    ctx.minLength = minLength;
    ctx.xmax = xmax;
    ctx.xmin = xmin;
    ctx.ymax = ymax;
    ctx.ymin = ymin;

    // Set the range based on what we know now.
    ctx.xrange = ctx.xmax - ctx.xmin;
    ctx.yrange = ctx.ymax - ctx.ymin;

    // Create the scales if they don't exist.
    if(ctx.domainScale === undefined) {
      ctx.domainScale = CLACK.makeScale(ctx.domainScaleType);
      ctx.domainScale.rangeRound([0, this.options.width]);
    
      ctx.rangeScale = CLACK.makeScale(ctx.rangeScaleType);;
      ctx.rangeScale.rangeRound([this.options.height, 0]);
    }

    // Some help for log scales, which can't have a 0!
    if(ctx.domainScaleType === 'log') {
      if(ctx.xmin === 0) {
        // log(0) == -Infinity!
        ctx.xmin = 1;
      }
    }
    if(ctx.rangeScaleType === 'log') {
      // log(0) == -Infinity!
      if(ctx.ymin === 0) {
        ctx.ymin = 1;
      }
    }

    // Finally, set the comain for each scale.
    ctx.domainScale.domain([ctx.xmin, ctx.xmax]);
    ctx.rangeScale.domain([ctx.ymin, ctx.ymax]);
  }

  // Draw the chart. Erases everything first.
  this.draw = function() {
    // console.time('draw');

    // Handle the axes in the common draw method before calling the renderer.
    // Only create the axes if they don't already exist.
    if(this.options.axes) {
      var defCtx = this.contexts['default'];

      if(defCtx.domainAxis === undefined) {
        defCtx.domainAxis = d3.svg.axis().scale(defCtx.domainScale).orient('bottom').ticks(5);
        defCtx.rangeAxis = d3.svg.axis().scale(defCtx.rangeScale).orient('left').ticks(5);
      } else {
        // If the axes already exist transition them so they can be updated
        // if they have changed.
        this.ax.transition().call(defCtx.domainAxis);
        this.ay.transition().call(defCtx.rangeAxis);

        if(this.options.grids === true) {
          // remove the ticks. Can't get them to move right so be lazy and re-add them
          this.d3shit.selectAll("line.x").remove();
          this.d3shit.selectAll("line.y").remove();
        }
      }

      // Draw the background grid.
      if(this.d3shit === undefined) {
        this.d3shit = d3.select(this.inner)
          .append("svg")
          .attr("class", "chart")
          .attr("width", this.options.width + 40) // These modifiers need to go, they don't work XXX
          .attr("height", this.options.height + 20)
          .append("g");

        this.ax = this.d3shit.append('g')
          .attr("class", "axis")
          .attr("transform", "translate(40," + this.options.height + ")")
          .call(defCtx.domainAxis);
         
        this.ay = this.d3shit.append('g')
          .attr("class", "axis")
          .attr("transform", "translate(40,0)")
          .call(defCtx.rangeAxis);
      }

      if(this.options.grids) {
        // Draw the grids. Done regardless because re-draws remove them.
        this.d3shit.selectAll("line.x")
          .data(defCtx.domainScale.ticks(5))
          .enter().append("line")
          .attr("class", "x")
          .attr("x1", defCtx.domainScale)
          .attr("x2", defCtx.domainScale)
          .attr("y1", 0)
          .attr("y2", this.options.height)
          .attr("transform", "translate(40, 0)")
          .style("stroke", this.options.gridColor);

        // This isn't axes, it's ticks! XXX
        this.d3shit.selectAll("line.y")
          .data(defCtx.rangeScale.ticks(5))
          .enter().append("line")
          .attr("class", "y")
          .attr("x1", 0)
          .attr("x2", this.options.width)
          .attr("y1", defCtx.rangeScale)
          .attr("y2", defCtx.rangeScale)
          .attr("transform", "translate(40, 0)")
          .style("stroke", this.options.gridColor);
      }

    } else {
      // Nix the svg, if we have one!
      // XXX Must we use jquery here?
      this.d3shit = undefined;
      $(this.inner).find("svg").remove();
    }

    this.options.renderer.draw(this, this.memCtx);
    
    // console.timeEnd('draw');
  }

  this.drawDecorations = function() {
    var self = this;

    var ctx = this.getMemoryCanvas();
    // Clear the in-memory context for the renderer.
    ctx.clearRect(0, 0, this.options.width, this.options.height);
    // Begin a new path, just in case
    ctx.beginPath();

    for(var ctxName in self.contexts) {
      var c = self.contexts[ctxName];
      if(c.markers.length > 0) {
        // Iterate over any markers
        for(var i = 0; i < c.markers.length; i++) {
          var m = c.markers[i];
          if(m.x1 !== undefined) {
            if(m.x2 !== undefined) {
              // XXX Draw a box
            } else {
              // Just a simple line
              ctx.beginPath();
              ctx.strokeStyle = m.color;
              ctx.lineWidth = 1;
              ctx.moveTo(m.x1, 0);
              ctx.lineTo(m.x1, self.options.height);
              ctx.stroke();
            }
          } else if(m.y1 !== undefined) {
            if(m.y2 !== undefined) {
              // XXX Draw a box
            } else {
              // Just a simple line
              ctx.beginPath();
              ctx.strokeStyle = m.color;
              ctx.lineWidth = 3;
              ctx.moveTo(0, m.y1);
              ctx.lineTo(self.options.width, m.y1);
              ctx.stroke();
            }
          }
        }
      }
    }

    var fctx = this.getDecorationCanvas();
    // Clear the current in-browser context.
    fctx.clearRect(0, 0, this.options.width, this.options.height);
    // Copy the contents on the in-memory canvas into the displayed one.
    fctx.drawImage(this.getMemoryElement(), 0, 0);
  }
}

// Convencience function for creating a scale based
// on a string name.
CLACK.makeScale = function(type) {
  if(type === 'log') {
    return d3.scale.log();
  } else if(type === 'quantile') {
    return d3.scale.quantize();
  } else if(type === 'quantize') {
    return d3.scale.quantize();
  } else if(type === 'sqrt') {
    return d3.scale.pow();
  } else if(type === 'threshold') {
    return d3.scale.threshold();
  } else if(type === 'time') {
    return d3.time.scale();
  } else {
    return d3.scale.linear();
  }
}


// A Line Renderer!
CLACK.LineRenderer = function(options) {
  options = options || {};

  // Whether or not to show dots.
  options['dots'] = options['dots'] || false;
  // Size of the aboe dots (if true)
  options['dotSize'] = options['dotSize'] || 2;
  options['lineWidth'] = options['lineWidth'] || 1;

  this.draw = function(chart, ctx) {
    var ctx = chart.getMemoryCanvas();
    // Clear the in-memory context for the renderer.
    ctx.clearRect(0, 0, chart.options.width, chart.options.height);

    // Iterate over each context
    for(var ctxName in chart.contexts) {
      var c = chart.contexts[ctxName];

      // Iterate over each series
      for(var j = 0; j < c.series.length; j++) {
        // Create a new path for each series.
        ctx.beginPath();
        // Set color
        ctx.strokeStyle = c.series[j].color;
        ctx.lineWidth = options['lineWidth'];

        for(var k = 0; k < c.series[j].x.length; k++) {
          ctx.lineTo(c.domainScale(c.series[j].x[k]), c.rangeScale(c.series[j].y[k]));
        }
        ctx.stroke();

        if(options['dots']) {
          ctx.beginPath();
          ctx.fillStyle = c.series[j].color;
          for(var k = 0; k < c.series[j].x.length; k++) {
            var myX = c.domainScale(c.series[j].x[k]);
            var myY = c.rangeScale(c.series[j].y[k]);
            ctx.moveTo(myX, myY);
            ctx.arc(myX, myY, options['dotSize'], 0, 2 * Math.PI, true);
          }
          ctx.fill();
        }
      }
    }

    var fctx = chart.getCanvas();
    // Clear the current in-browser context.
    fctx.clearRect(0, 0, chart.options.width, chart.options.height);
    // Copy the contents on the in-memory canvas into the displayed one.
    fctx.drawImage(chart.getMemoryElement(), 0, 0);
  } 
}

// A Scatter Plot Renderer
CLACK.ScatterPlotRenderer = function(options) {
  options = options || {};

  // Size of the dots!
  options['dotSize'] = options['dotSize'] || 2

  this.draw = function(chart, ctx) {
    var ctx = chart.getMemoryCanvas();
    // Clear the in-memory context for the renderer.
    ctx.clearRect(0, 0, chart.options.width, chart.options.height);

    // Iterate over each context
    for(var ctxName in chart.contexts) {
      var c = chart.contexts[ctxName];

      // Iterate over each series
      for(var j = 0; j < c.series.length; j++) {
        // Create a new path for each series.
        ctx.beginPath();
        // Set color
        ctx.fillStyle = c.series[j].color;

        for(var k = 0; k < c.series[j].x.length; k++) {
          ctx.arc(c.domainScale(c.series[j].x[k]), c.rangeScale(c.series[j].y[k]), options['dotSize'], 0, 2*Math.PI);
        }
        ctx.fill();
      }
    }

    var fctx = chart.getCanvas();
    // Clear the current in-browser context.
    fctx.clearRect(0, 0, chart.options.width, chart.options.height);
    // Copy the contents on the in-memory canvas into the displayed one.
    fctx.drawImage(chart.getMemoryElement(), 0, 0);
  }
}

// Doesn't know how to deal with added series. :(
CLACK.InstantRenderer = function(options) {
  options = options || {};

  options['formatter'] = options['formatter'] || d3.format(".2f");

  this.domSeriesDivs = undefined;

  this.draw = function(chart, ctx) {

    // Iterate over each context
    for(var ctxName in chart.contexts) {
      // Not sure what to do with multiple contexts here yet…
      var c = chart.contexts[ctxName];

      if(this.demSeriesDivs === undefined) {
        this.demSeriesDivs = d3.select(chart.inner).selectAll("div")
          // XXX Need a key for efficient updates here, series name or a UUID or something?
          .data(c.series)
          .enter().append('div')
          .style('display', 'inline-block')
          .style('margin', '3px')
          .style('padding', '3px')
          .style('border', '1px solid #efefef');

        // Name
        this.demSeriesDivs.append('p').text(function(s) { return s.name; })
          .style('font-size', '1em')
          .style('font-weight', 'bold')
          .style('text-align', 'center')
          .style('border-bottom', '1px solid #ccc')
          .style('padding', '.05em');
        // Min
        this.demSeriesDivs.append('p').text(function(s) { return options.formatter(s.ymin); })
          .style('text-align', 'center')
          .attr('data-min', 'true');
        // Current

        this.demSeriesDivs.append('div')
          .text(function(s) { return options.formatter(s.y[s.y.length - 1]); })
          .style('border-bottom', '1px solid #ccc')
          .style('border-top', '1px solid #ccc')
          .style('font-size', '2em')
          .style('font-weight', 'bold')
          .style('padding', '.25em')
          .style('text-align', 'center')
          .attr('data-current', 'true');

        // Max
        this.demSeriesDivs.append('p').text(function(s) { return options.formatter(s.ymax); })
          .style('font-size', '1em')
          .style('font-weight', 'bold')
          .style('text-align', 'center')
          .style('padding', '.05em')
          .attr('data-max', 'true');
      } else {
        this.demSeriesDivs.data(c.series).selectAll("div[data-min=true]")
          .text(function(s) { return options.formatter(s.ymin); });

        this.demSeriesDivs.data(c.series).selectAll("div[data-current=true]")
          .text(function(s) { return options.formatter(s.y[s.y.length - 1]); });

        this.demSeriesDivs.data(c.series).selectAll("div[data-max=true]")
          .text(function(s) { return options.formatter(s.ymax); });
      }
    }
  }
}

// A Histogram HeatMap Renderer.
// Many time series merged into one visualization. Each x "column" is a histogram of Y values, shown as a heatmap.
// Note that this ignores the color set on the series!
CLACK.HistogramHeatMapRenderer = function(options) {
  options = options || {};

  // Allow the user to specify a way to convert a color value into an actual holor. The
  // default is to just return the color's value but other implementations might return
  // 'rgba(0, 0, 255, $color)' to adjust the alpha channel.  The result of this is passed
  // to the canvas context's `fillStyle` property.
  options['colorFunction'] = options['colorScaleStart'] || function(color) { return color; }
  // Color scale start value.
  options['colorScaleStart'] = options['colorScaleStart'] || 'blue';
  // Color scale end value.
  options['colorScaleEnd'] = options['colorScaleEnd'] || 'red';
  // Scale of color. Uses CLACK.makeScale
  options['colorScale'] = options['colorScale'] || 'log';

  this.draw = function(chart, ctx) {
    var ctx = chart.getMemoryCanvas();
    // Clear the in-memory context for the renderer.
    ctx.clearRect(0, 0, chart.options.width, chart.options.height);

    // Iterate over each context
    for(var ctxName in chart.contexts) {
      // Not sure what to do with multiple contexts here yet…
      var c = chart.contexts[ctxName];

      var exes = {};
      // Create a map of x values to y values, as we need to bucket them.
      for(var j = 0; j < c.series.length; j++) {
        for(var k = 0; k < c.series[j].x.length; k++) {
          var myX = c.series[j].x[k];
          if(myX in exes) {
            exes[myX].push(c.series[j].y[k]);
          } else {
            exes[myX] = [ c.series[j].y[k] ];
          }
        }
      }

      // Create a new histogram and set it's range to the min/max for
      // the entire set of series.
      var binCount = Math.round(chart.options.height / 5)
      var layout = d3.layout.histogram()
        // Set the number of bins to the range of our entire context's Y.
        .bins(binCount);
      layout.range([ c.ymin, c.ymax ]);

      var bheight = chart.options.height / binCount;
      // The width for each bin
      var bwidth = chart.options.width / Object.keys(exes).length;

      // Create a color range that spans from 0 to the number of Y values in our histogram.
      var colorScale = CLACK.makeScale(options['colorScale']).domain([ 1, c.maxLength ]).range([ options['colorScaleStart'], options['colorScaleEnd'] ]);

      // For each bin…
      var colIndex = 0;
      for(var col in exes) {
        // Get the histogram for this x position
        var histo = layout(exes[col]);

        // Iterate over the bins.
        for(var bin = 0; bin < histo.length; bin++) {
          var v = histo[bin];
          // Only draw a square if we have a value. Don't waste time on empty spots.
          if(v.y > 0) {
            ctx.beginPath();
            ctx.fillStyle = options['colorFunction'](colorScale(v.y));
            // Calculate a bar height, which will be the 1 - dx from the histogram's bin
            // times the height of the whole chart.
            ctx.fillRect(
              0 + (colIndex * bwidth),              // x is the offset from 0
              chart.options.height - ((bin + 1) * bheight),
              bwidth, // bar's width (evenly spaced based on the number of columns)
              bheight // And the height!
            );
          }
        }
        colIndex++;
      }
    }

    var fctx = chart.getCanvas();
    // Clear the current in-browser context.
    fctx.clearRect(0, 0, chart.options.width, chart.options.height);
    // Copy the contents on the in-memory canvas into the displayed one.
    fctx.drawImage(chart.getMemoryElement(), 0, 0);    
  }
}