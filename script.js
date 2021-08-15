import * as d3 from "https://cdn.skypack.dev/d3@7";

const pathString = (arcs) => {
  return arcs.reduce((path, points) => {
    return path + line(points) + 'Z'
  }, '')
}

const decodeArc = (topology, arcs) => {
  let x = 0, y = 0

  return arcs.map(point => {
    point = point.slice()
    point[0] = (x += point[0]) * topology.transform.scale[0] + topology.transform.translate[0]
    point[1] = (y += point[1]) * topology.transform.scale[1] + topology.transform.translate[1]
    return point
  })
}

const decodeLineString = (topology, lineString) => {
  return lineString.map(
    arcIdxArr => arcIdxArr.map((arcIdx, i) => {
      const arc = topology.arcs[arcIdx < 0 ? ~arcIdx : arcIdx].slice()
      const decodedArc = decodeArc(topology, arc)

      if (arcIdx < 0) {
        decodedArc.reverse()
      }
      decodedArc.pop()

      return decodedArc
    }).flat()
  )
}

const decodeGeometry = (topology, geometry) => {
  switch(geometry.type) {

    case 'Polygon': {
      return decodeLineString(topology, geometry.arcs)
    }

    case 'MultiPolygon': {
      return geometry.arcs.map(
        geometry => decodeLineString(topology, geometry)
      )
    }
  }
}

const pathLineString = (points, generator) => {
  return points.reduce((path, arc) => {
    return path + generator(arc) + 'Z'
  }, '')
}

const encodePath = (points, geometry, generator) => {
  switch(geometry.type) {

    case 'Polygon': {
      return pathLineString(points, generator)
    }

    case 'MultiPolygon': {
      return points.reduce((path, points) => {
        return path + pathLineString(points, generator)
      }, '')
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const urlCounties = './json/counties.json';
  const urlEducation = './json/education.json';

  Promise.all([
    fetch(urlCounties).then(response => response.json()),
    fetch(urlEducation).then(response => response.json())
  ])
    .then(([response1, response2]) => {

      // Choropleth

      const topology = response1;
      const education = response2.reduce((obj, item) => {
        Object.assign(obj, {[item.fips]: item})
        return obj
      }, {})

      const bbox = topology.bbox.map(val => {
        return val < 0 ? 0 : val
      })

      const w = window.innerWidth
        || document.documentElement.clientWidth
        || document.body.clientWidth;

      const h = window.innerHeight
        || document.documentElement.clientHeight
        || document.body.clientHeight;

      const counties = topology.objects.counties.geometries.slice()
      const nation = topology.objects.nation.geometries.slice()
      const states = topology.objects.states.geometries.slice()

      const tooltip = d3.select('.inner-container')
        .append('div')
        .attr('id', 'tooltip')
        .attr('class', 'tooltip')
        .style('opacity', 0)

      const svg = d3.select('.inner-container')
        .append('svg')
        .attr('id', 'choropleth')
        .attr('viewBox', bbox.join(' '))
        .attr('height', h * 0.75)

      const line = d3.line()
        .x(d => d[0])
        .y(d => d[1])

      const svgG = svg.selectAll('g')

      svgG.append('g')
        .data(counties)
        .enter()
        .append('path')
          .attr('d', d => {
            const points = decodeGeometry(topology, d)
            return encodePath(points, d, line)
          })
          .attr('class', 'county')
          .attr('fill', d =>
            'hsl(204, 54%, ' + (95-education[d.id].bachelorsOrHigher)  + '%)')
          .attr('data-fips', d => d.id)
          .attr('data-education', d => education[d.id].bachelorsOrHigher)
          .on('mouseover', (e, d) => {
            const ed = education[d.id]

            tooltip.transition()
              .duration(100)
              .style('opacity', 1)

            tooltip.html(
              ed.area_name + ', ' + ed.state + ': ' + ed.bachelorsOrHigher + '%'
            )
              .attr('data-education', ed.bachelorsOrHigher)
              .style("left", (e.pageX + 5) + "px")
              .style("top", (e.pageY - 30) + "px")
              .style('text-align', 'center')
          })
          .on('mouseout', (e, d) => {
            tooltip.transition()
              .duration(100)
              .style('opacity', 0)
          })

      svgG.append('g')
          .data(states)
          .enter()
          .append('path')
            .attr('d', d => {
              const points = decodeGeometry(topology, d)
              return encodePath(points, d, line)
            })
            .attr('class', 'state')
            .attr('fill', 'none')
            .attr('stroke', '#fff')
            .attr('stroke-width', '1')

     // Legend

      const numColors = 7
      const widthColor = 30
      const heightColor = 10
      const widthLegend = numColors * widthColor
      const paddingLegend = {
        x: 100,
        y: 50
      }

      const range = d3.extent(
        response2, county => county.bachelorsOrHigher)

      const colors = d3.quantize(d3.interpolateRgb(
        ...range.map(value => 'hsl(204, 54%, ' + (95 - value)  + '%)')
      ), 7)

      const intervals = d3.range(
        range[0], range[1], (range[1] - range[0]) / numColors)

      const xScaleLegend = d3.scaleLinear()
        .domain(range)
        .range([0, widthLegend])

      const svgWidth = svg.node().viewBox.baseVal.width
      const legendX = svgWidth - widthLegend - paddingLegend.x
      const legendY = paddingLegend.y

      const legend = svg.append('g')
          .attr('id', 'legend')
          .attr('transform', 'translate(' + legendX + ',' + legendY + ')')

      legend.selectAll('rect')
          .data(intervals)
          .enter()
          .append('rect')
            .attr('x', d => xScaleLegend(d))
            .attr('y', 0)
            .attr('width', widthColor)
            .attr('height', heightColor)
            .attr('fill', d => 'hsl(204, 54%, ' + (95 - parseInt(d))  + '%)')

      const xAxisLegend = d3.axisBottom(xScaleLegend)
        .tickValues(intervals.concat(range[1]))
        .tickFormat(t => d3.format('d')(t) + '%')
        .tickSize(heightColor * 1.5)

      legend.append('g')
        .call(xAxisLegend)
        .call(g => g.select('.domain').remove())

    })
    .catch(e => console.error('Error:', e.message))
})
