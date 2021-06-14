/*
*  Power BI Visualizations
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/

import {
    select,
    Selection,
    BaseType
} from "d3-selection";
import powerbi from "powerbi-visuals-api";
import * as formatting from "powerbi-visuals-utils-formattingutils";
import { pixelConverter as PixelConverter, prototype as Prototype } from "powerbi-visuals-utils-typeutils";

import {
    CssConstants,
    manipulation as svgManipulation
} from "powerbi-visuals-utils-svgutils";

import { ILegend, LegendData, LegendDataPoint, LegendPosition } from "./legendInterfaces";
import { LegendBehavior, LegendBehaviorOptions } from "./behavior/legendBehavior";
import {
    interactivityBaseService
} from "powerbi-visuals-utils-interactivityutils";
import IInteractivityService = interactivityBaseService.IInteractivityService;
import IInteractiveBehavior = interactivityBaseService.IInteractiveBehavior;
import * as _ from "lodash";

import * as Markers from "./markers";

import {
    LineStyle,
    MarkerShape
} from "./legendInterfaces";

// powerbi.visuals
import ISelectionId = powerbi.visuals.ISelectionId;

// powerbi.extensibility.utils.formatting
import TextProperties = formatting.interfaces.TextProperties;
import textMeasurementService = formatting.textMeasurementService;
import font = formatting.font;

// powerbi.extensibility.utils.svg
import ClassAndSelector = CssConstants.ClassAndSelector;
import createClassAndSelector = CssConstants.createClassAndSelector;

// powerbi.extensibility.utils.interactivity
import appendClearCatcher = interactivityBaseService.appendClearCatcher;
import dataHasSelection = interactivityBaseService.dataHasSelection;
import { BaseDataPoint } from "powerbi-visuals-utils-interactivityutils/lib/interactivityBaseService";

export interface TitleLayout {
    x: number;
    y: number;
    text: string;
    width: number;
    height: number;
}

export const enum NavigationArrowType {
    Increase,
    Decrease
}

export interface NavigationArrow {
    x: number;
    y: number;
    path: string;
    rotateTransform: string;
    dataType: NavigationArrowType;
}

export interface LegendLayout {
    numberOfItems: number;
    title: TitleLayout;
    navigationArrows: NavigationArrow[];
}

export interface LegendItem {
    dataPoint: LegendDataPoint;
    textProperties: TextProperties;
    width: number;
    desiredWidth: number;
    desiredOverMaxWidth: boolean;
}

export class SVGLegend implements ILegend {
    private orientation: LegendPosition;
    private viewport: powerbi.IViewport;
    private parentViewport: powerbi.IViewport;
    private svg: Selection<any, any, any, any>;
    private group: Selection<any, any, any, any>;
    private clearCatcher: Selection<any, any, any, any>;
    private element: HTMLElement;
    private primaryTitle: any;
    private secondaryTitle: any;
    private showPrimary: any;
    private secondaryExists: any;


    private interactivityService: IInteractivityService<LegendDataPoint>;
    private interactiveBehavior?: IInteractiveBehavior;
    private legendDataStartIndex = 0;
    private arrowPosWindow = 1;
    private data: LegendData;
    private isScrollable: boolean;

    private lastCalculatedWidth = 0;
    private visibleLegendWidth = 0;
    private visibleLegendHeight = 0;
    private legendFontSizeMarginDifference = 0;
    private legendFontSizeMarginValue = 0;

    public static DefaultFontSizeInPt = 8;
    private static LegendIconRadius = 5;
    private static MaxTextLength = 60;
    private static MaxTitleLength = 80;
    private static TextAndIconPadding = 5;
    private static TitlePadding = 15;
    private static LegendEdgeMariginWidth = 10;
    private static LegendMaxWidthFactor = 0.3;
    private static TopLegendHeight = 24;
    private static DefaultTextMargin = PixelConverter.fromPointToPixel(SVGLegend.DefaultFontSizeInPt);
    private static LegendIconYRatio = 0.52;
    private static DefaultMaxLegendFactor = SVGLegend.MaxTitleLength / SVGLegend.DefaultTextMargin;

    // Navigation Arrow constants
    private static LegendArrowOffset = 10;
    private static LegendArrowHeight = 15;
    private static LegendArrowWidth = 7.5;

    private static DefaultFontFamily = font.Family.regular.css;
    private static DefaultTitleFontFamily = font.Family.semibold.css;


    private static LegendItem: ClassAndSelector = createClassAndSelector("legendItem");
    private static LegendText: ClassAndSelector = createClassAndSelector("legendText");
    private static LegendIcon: ClassAndSelector = createClassAndSelector("legendIcon");
    private static LegendTitle: ClassAndSelector = createClassAndSelector("legendTitle");
    private static NavigationArrow: ClassAndSelector = createClassAndSelector("navArrow");
    // # sourceMappingURL=svgLegend.js.map

    constructor(
        element: HTMLElement,
        legendPosition: LegendPosition,
        interactivityService: IInteractivityService<LegendDataPoint>,
        isScrollable: boolean,
        interactiveBehavior?: IInteractiveBehavior
    ) {

        this.svg = select(element)
            .append("svg")
            .style("position", "absolute");

        this.svg.style("display", "inherit");
        this.svg.classed("legend", true);
        this.svg.classed("ring_legend", true);
        this.primaryTitle = "";
        this.secondaryTitle = "";

        if (interactivityService) {
            this.clearCatcher = appendClearCatcher(this.svg);
        }

        this.group = this.svg
            .append("g")
            .attr("id", "legendGroup");

        this.interactiveBehavior = interactiveBehavior ? interactiveBehavior : new LegendBehavior();
        this.interactivityService = interactivityService;
        this.isScrollable = isScrollable;
        this.element = element;
        this.changeOrientation(legendPosition);
        this.parentViewport = { height: 0, width: 0 };
        this.calculateViewport();
        this.updateLayout();
    }

    private updateLayout() {
        let legendViewport = this.viewport;
        let orientation = this.orientation;

        // new code
        if (this.data) {
            if (orientation === LegendPosition.Top || orientation === LegendPosition.Bottom || orientation === LegendPosition.TopCenter || orientation === LegendPosition.BottomCenter) {
                if (this.showPrimary && this.secondaryExists) {
                    legendViewport.height = legendViewport.height + 3 * (this.legendFontSizeMarginDifference) + 20;
                } else {
                    legendViewport.height = legendViewport.height + 2 * (this.legendFontSizeMarginDifference) + 20;
                }
            }
        }

        this.svg.attr(
            "height", legendViewport.height || (orientation === LegendPosition.None ? 0 : this.parentViewport.height)
        );
        this.svg.attr(
            "width", legendViewport.width || (orientation === LegendPosition.None ? 0 : this.parentViewport.width)
        );

        let isRight = orientation === LegendPosition.Right || orientation === LegendPosition.RightCenter,
            isBottom = orientation === LegendPosition.Bottom || orientation === LegendPosition.BottomCenter;

        this.svg.style(
            "margin-left", isRight ? (this.parentViewport.width - legendViewport.width) + "px" : null
        );
        this.svg.style(
            "margin-top", isBottom ? (this.parentViewport.height - legendViewport.height) + "px" : null,
        );
    }

    private calculateViewport(): void {
        switch (this.orientation) {
            case LegendPosition.Top:
            case LegendPosition.Bottom:
            case LegendPosition.TopCenter:
            case LegendPosition.BottomCenter:
                let pixelHeight = PixelConverter.fromPointToPixel(this.data && this.data.fontSize
                    ? this.data.fontSize
                    : SVGLegend.DefaultFontSizeInPt);

                let fontHeightSize = SVGLegend.TopLegendHeight + (pixelHeight - SVGLegend.DefaultFontSizeInPt);
                this.viewport = { height: fontHeightSize, width: 0 };
                return;
            case LegendPosition.Right:
            case LegendPosition.Left:
            case LegendPosition.RightCenter:
            case LegendPosition.LeftCenter:
                let width = this.lastCalculatedWidth
                    ? this.lastCalculatedWidth
                    : this.parentViewport.width * SVGLegend.LegendMaxWidthFactor;

                this.viewport = { height: 0, width: width + this.data.fontSize };
                return;

            case LegendPosition.None:
                this.viewport = { height: 0, width: 0 };
        }
    }

    public getMargins(): powerbi.IViewport {
        return this.viewport;
    }

    public isVisible(): boolean {
        return this.orientation !== LegendPosition.None;
    }

    public changeOrientation(orientation: LegendPosition): void {
        if (orientation) {
            this.orientation = orientation;
        } else {
            this.orientation = LegendPosition.Top;
        }

        this.svg.attr("orientation", orientation);
    }

    public getOrientation(): LegendPosition {
        return this.orientation;
    }

    public drawLegend(data: LegendData, viewport: powerbi.IViewport): void {
        // clone because we modify legend item label with ellipsis if it is truncated
        let clonedData = Prototype.inherit(data),
            newDataPoints: LegendDataPoint[] = [];

        for (let dp of data.dataPoints) {
            newDataPoints.push(Prototype.inherit(dp));
        }

        clonedData.dataPoints = newDataPoints;

        this.setTooltipToLegendItems(clonedData);
        this.drawLegendInternal(clonedData, viewport, true /* perform auto width */);
    }

    public drawLegendInternal(data: LegendData, viewport: powerbi.IViewport, autoWidth: boolean): void {
        this.parentViewport = viewport;
        this.data = data;

        if (this.interactivityService)
            this.interactivityService.applySelectionStateToData(data.dataPoints);

        if (data.dataPoints.length === 0) {
            this.changeOrientation(LegendPosition.None);
        }

        if (this.getOrientation() === LegendPosition.None) {
            data.dataPoints = [];
        }

        // Adding back the workaround for Legend Left/Right position for Map
        let mapControls = this.element.getElementsByClassName("mapControl");
        if (mapControls.length > 0 && !this.isTopOrBottom(this.orientation)) {
            for (let i = 0; i < mapControls.length; ++i) {
                let element = <HTMLElement>mapControls[i];
                element.style.display = "inline-block";
            }
        }

        let primaryTooltip, secondaryTooltip;
        primaryTooltip = data["primaryTitle"];

        if (data.primaryType === "None") {
            this.showPrimary = false;
        } else {
            this.showPrimary = true;
        }
        if (data.dataPoints) {
            // Secondary Measure
            for (let index = 0; index < this.data.dataPoints.length; index++) {
                if (this.data.dataPoints[index]["secondaryMeasure"] && this.data.dataPoints[index]["secondaryMeasure"] !== "") {
                    secondaryTooltip = data["secondaryTitle"];
                    this.secondaryExists = 1;
                    break;
                }
                else {
                    this.secondaryExists = 0;
                    continue;
                }
            }
        }

        this.calculateViewport();

        let layout = this.calculateLayout(data, autoWidth);
        let titleLayout = layout.title;
        let titleData = titleLayout ? [titleLayout] : [];
        let hasSelection = this.interactivityService && dataHasSelection(data.dataPoints);
        this.group
            .selectAll(SVGLegend.LegendItem.selectorName).remove();
        this.group
            .selectAll(SVGLegend.LegendTitle.selectorName).remove();
        let group = this.group;

        // transform the wrapping group if position is centered
        if (this.isCentered(this.orientation)) {
            let centerOffset = 0;
            if (this.isTopOrBottom(this.orientation)) {
                centerOffset = Math.max(0, (this.parentViewport.width - this.visibleLegendWidth) / 2);
                group.attr("transform", svgManipulation.translate(centerOffset, 0));
            }
            else {
                centerOffset = Math.max((this.parentViewport.height - this.visibleLegendHeight) / 2) < 0 ? 0 : Math.max((this.parentViewport.height - this.visibleLegendHeight) / 2);
                group.attr("transform", svgManipulation.translate(0, centerOffset));
            }
        }
        else {
            group.attr("transform", null);
        }

        let legendTitle = group
            .selectAll(SVGLegend.LegendTitle.selectorName);

        let legendTitleData = legendTitle.data(titleData);

        let enteredLegendTitle = legendTitleData
            .enter()
            .append("text")
            .classed(SVGLegend.LegendTitle.className, true);

        legendTitleData
            .merge(enteredLegendTitle)
            .style("fill", data.labelColor)
            .style("font-size", PixelConverter.fromPoint(data.fontSize))
            .style("font-family", data.fontFamily)
            .text((d: TitleLayout) => d.text)
            .attr("x", (d: TitleLayout) => d.x)
            .attr("y", (d: TitleLayout) => d.y)
            .append("title")
            .text(data.title);
        // new code
        let This = this;
        if (this.showPrimary) {
            if (data["primaryTitle"]) {
                let legendWidth = parseFloat(this.svg.style("width"));
                this.primaryTitle = textMeasurementService.getTailoredTextOrDefault(SVGLegend.getTextProperties
                    (true, this.data["primaryTitle"], this.data.fontSize), legendWidth - 10);
                legendTitleData.enter().append("text").text(this.primaryTitle)
                    .style("fill", data.labelColor)
                    .style("font-size", PixelConverter.fromPoint(data.fontSize))
                    .attr("x", (d) => d.x)
                    .attr("y", (d) => (2 * d.y + This.legendFontSizeMarginDifference / 2))
                    .classed(SVGLegend.LegendTitle.className, true);
                legendTitle.append("title").text(primaryTooltip);
                legendTitleData.selectAll(SVGLegend.LegendTitle.className).text(this.primaryTitle);
            }
        }
        if (data["secondaryTitle"] && !!data.title) {
            let yPosition = 0;
            if (titleLayout) {
                if (this.showPrimary) {
                    yPosition = (3 * titleLayout.y + This.legendFontSizeMarginDifference);
                }
                else {
                    yPosition = (2 * titleLayout.y + This.legendFontSizeMarginDifference / 2);
                }
            }
            legendTitleData.enter().append("text").text(this.secondaryTitle)
                .style("fill", data.labelColor)
                .style("font-size", PixelConverter.fromPoint(data.fontSize))
                .attr("x", (d) => d.x)
                .attr("y", (d) => yPosition)
                .classed(SVGLegend.LegendTitle.className, true);
            legendTitle
                .append("title").text(secondaryTooltip);
        }

        let virtualizedDataPoints = data.dataPoints.slice(
            this.legendDataStartIndex,
            this.legendDataStartIndex + layout.numberOfItems);

        let legendItems = group
            .selectAll(SVGLegend.LegendItem.selectorName)
            .data(virtualizedDataPoints, (d: LegendDataPoint) => {
                return (d.identity as ISelectionId).getKey() + (d.layerNumber != null ? d.layerNumber : "");
            });

        let itemsEnter = legendItems.enter()
            .append("g")
            .classed(SVGLegend.LegendItem.className, true);

        itemsEnter
            .append("path")
            .classed(SVGLegend.LegendIcon.className, true);

        itemsEnter
            .append("text")
            .classed(SVGLegend.LegendText.className, true);

        itemsEnter
            .append("title")
            .text((d: LegendDataPoint) => d.tooltip);

        let mergedLegendIcons = legendItems
            .merge(itemsEnter)
            .select(SVGLegend.LegendIcon.selectorName)
            .attr("transform", (dataPoint: LegendDataPoint) => {
                return svgManipulation.translateAndScale(
                    dataPoint.glyphPosition.x,
                    dataPoint.glyphPosition.y,
                    this.getIconScale(dataPoint.markerShape)
                );
            })
            .attr("d", (dataPoint: LegendDataPoint) => {
                return Markers.getPath(dataPoint.markerShape || MarkerShape.circle);
            })
            .attr("stroke-width", (dataPoint: LegendDataPoint) => {
                if (dataPoint.lineStyle) {
                    return 2;
                }

                return Markers.getStrokeWidth(dataPoint.markerShape || MarkerShape.circle);
            })
            .style("fill", (dataPoint: LegendDataPoint) => {
                if (dataPoint.lineStyle) {
                    return null;
                }

                return dataPoint.color;
            })
            .style("stroke", (dataPoint: LegendDataPoint) => dataPoint.color)
            .style("stroke-dasharray", (dataPoint: LegendDataPoint) => {
                if (dataPoint.lineStyle) {
                    return SVGLegend.getStrokeDashArrayForLegend(dataPoint.lineStyle);
                }

                return null;
            })
            .style("stroke-linejoin", "round");

        legendItems
            .merge(itemsEnter)
            .select("title")
            .text((dataPoint: LegendDataPoint) => dataPoint.tooltip);

        const mergedLegendItems = legendItems.merge(itemsEnter);

        mergedLegendItems
            .select(SVGLegend.LegendText.selectorName)
            .attr("x", (dataPoint: LegendDataPoint) => dataPoint.textPosition.x)
            .attr("y", (dataPoint: LegendDataPoint) => dataPoint.textPosition.y)
            .text((d: LegendDataPoint) => d.label)
            .style("fill", data.labelColor)
            .style("font-size", PixelConverter.fromPoint(data.fontSize))
            .style("font-family", data.fontFamily);

        // Primary Measure
        if (data.primaryType !== "None") {
            itemsEnter.append("g").classed("PMlegendItems", true);
            itemsEnter.select(".PMlegendItems").append("text").classed("primaryMeasure", true).text((d) => {
                return d.measure;
            });
            itemsEnter.select(".PMlegendItems").append("title").text((d) => {
                return d.primaryTooltip;
            });
        }
        // Secondary Measure
        if (this.secondaryExists) {
            itemsEnter.append("g").classed("SMlegendItems", true);
            itemsEnter.select(".SMlegendItems").append("text").classed("secondaryMeasure", true).text((d) => { return d.secondaryMeasure; });
            itemsEnter.select(".SMlegendItems").append("title").text((d) => { return d.secondaryTooltip; });
        }
        if (data.primaryType !== "None") {
            if (this.isTopOrBottom(this.orientation)) {
                mergedLegendItems
                    .select(".primaryMeasure")
                    .attr("x", (d) => { return d.textPosition.x; })
                    .attr("y", (d) => { return 2 * d.textPosition.y + This.legendFontSizeMarginDifference / 2; })
                    .style("fill", data.labelColor)
                    .style("font-size", PixelConverter.fromPoint(data.fontSize));
                if (data.primaryType === "Value") {
                    itemsEnter.select(".PMlegendItems").append("path")
                        .attr("d", (d) => {
                            let arrowPos = "";
                            if (!d.primaryIndicator) {
                                arrowPos = "-";
                            }
                            return "M0 0L0 " + This.data.fontSize + "L" + arrowPos + This.data.fontSize / 2 + " " + This.data.fontSize / 2 + "Z";
                        })
                        .attr("transform", (d) => {
                            let arrowPos = 1;
                            if (!d.primaryIndicator) {
                                arrowPos = 0.95;
                            }
                            return "translate(" + (d.textPosition.x + textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(true, d.measure, This.data.fontSize)) + 5) + "," +
                                ((2 * d.textPosition.y + This.legendFontSizeMarginDifference / 2) - (textMeasurementService.measureSvgTextHeight(SVGLegend.getTextProperties(true, d.measure, This.data.fontSize)) / 4)) * arrowPos
                                + ") rotate(270 0 0)";
                        })
                        .classed("PMIndicator", true);
                }
                else if (data.primaryType === "Percentage") {
                    itemsEnter.select(".PMlegendItems").append("path")
                        .attr("d", (d) => {
                            let arrowPos = "";
                            if (!d.primaryIndicator) {
                                arrowPos = "-";
                            }
                            return "M0 0L0 " + This.data.fontSize + "L" + arrowPos + This.data.fontSize / 2 + " " + This.data.fontSize / 2 + "Z'";
                        })
                        .attr("transform", (d) => {
                            let arrowPos = 1;
                            if (!d.primaryIndicator) {
                                arrowPos = 0.95;
                            }
                            return "translate(" + (d.textPosition.x + textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(true, d.measure, This.data.fontSize)) + 5) + "," +
                                ((2 * d.textPosition.y + This.legendFontSizeMarginDifference / 2) - (textMeasurementService.measureSvgTextHeight(SVGLegend.getTextProperties(true, d.measure, This.data.fontSize)) / 4)) * arrowPos
                                + ") rotate(270 0 0)";
                        })
                        .classed("PMIndicator", true);
                }
                else if (data.primaryType === "Both") {
                    itemsEnter.select(".PMlegendItems").append("path")
                        .attr("d", (d) => {
                            let arrowPos = "";
                            if (!d.primaryIndicator) {
                                arrowPos = "-";
                            }
                            return "M0 0L0 " + This.data.fontSize + "L" + arrowPos + This.data.fontSize / 2 + " " + This.data.fontSize / 2 + "Z";
                        })
                        .attr("transform", (d) => {
                            let arrowPos = 1;
                            if (!d.primaryIndicator) {
                                arrowPos = 0.95;
                            }
                            return "translate(" + (d.textPosition.x + textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(true, d.measure, This.data.fontSize)) + 5) + "," +
                                ((2 * d.textPosition.y + This.legendFontSizeMarginDifference / 2) - (textMeasurementService.measureSvgTextHeight(SVGLegend.getTextProperties(true, d.measure, This.data.fontSize)) / 4)) * arrowPos
                                + ") rotate(270 0 0)";
                        })
                        .classed("PMIndicator", true);
                }
                if (this.secondaryExists) {
                    mergedLegendItems
                        .select(".secondaryMeasure")
                        .attr("x", (d) => { return d.textPosition.x; })
                        .attr("y", (d) => { return 3 * d.textPosition.y + This.legendFontSizeMarginDifference; })
                        .style("fill", data.labelColor)
                        .style("font-size", PixelConverter.fromPoint(data.fontSize));
                    itemsEnter.select(".SMlegendItems").append("path")
                        .attr("d", (d) => {
                            let arrowPos = "";
                            if (!d.secondaryIndicator) {
                                arrowPos = "-";
                            }
                            return "M0 0L0 " + This.data.fontSize + "L" + arrowPos + This.data.fontSize / 2 + " " + This.data.fontSize / 2 + "Z";
                        })
                        .attr("transform", (d) => {
                            let arrowPos = 1;
                            if (!d.secondaryIndicator) {
                                arrowPos = 0.95;
                            }
                            return "translate(" + (d.textPosition.x + textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(true, d["secondaryMeasure"], This.data.fontSize)) + 5) + "," +
                                ((3 * d.textPosition.y + This.legendFontSizeMarginDifference) - (textMeasurementService.measureSvgTextHeight(SVGLegend.getTextProperties(true, d["secondaryMeasure"], This.data.fontSize)) / 4)) * arrowPos
                                + ") rotate(270 0 0)";
                        })
                        .classed("SMIndicator", true);
                }
            }
            else {
                mergedLegendItems
                    .select(".primaryMeasure")
                    .attr("x", (d) => { return d.textPosition.x; })
                    .attr("y", (d) => { return d.textPosition.y + (This.legendFontSizeMarginDifference / 2) + 20; })
                    .style("fill", data.labelColor)
                    .style("font-size", PixelConverter.fromPoint(data.fontSize));
                if (data.primaryType === "Value") {
                    itemsEnter.select(".PMlegendItems").append("path")
                        .attr("d", (d) => {
                            let arrowPos = "";
                            if (!d.primaryIndicator) {
                                arrowPos = "-";
                            }
                            return "M0 0L0 " + This.data.fontSize + "L" + arrowPos + This.data.fontSize / 2 + " " + This.data.fontSize / 2 + "Z";
                        })
                        .attr("transform", (d) => {
                            let arrowPos = 1;
                            if (!d.primaryIndicator) {
                                arrowPos = 0.98;
                            }
                            return "translate(" + (d.textPosition.x + textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(true, d.measure, This.data.fontSize))) + "," +
                                ((d.textPosition.y + (This.legendFontSizeMarginDifference / 2) + 20) - (textMeasurementService.measureSvgTextHeight(SVGLegend.getTextProperties(true, d.measure, This.data.fontSize)) / 4)) * arrowPos +
                                ") rotate(270 0 0)";
                        })
                        .classed("PMIndicator", true);
                }
                else if (data.primaryType === "Percentage") {
                    itemsEnter.select(".PMlegendItems").append("path")
                        .attr("d", (d) => {
                            let arrowPos = "";
                            if (!d.primaryIndicator) {
                                arrowPos = "-";
                            }
                            return "M0 0L0 " + This.data.fontSize + "L" + arrowPos + This.data.fontSize / 2 + " " + This.data.fontSize / 2 + "Z";
                        })
                        .attr("transform", (d) => {
                            let arrowPos = 1;
                            if (!d.primaryIndicator) {
                                arrowPos = 0.98;
                            }
                            return "translate(" + (d.textPosition.x + textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(true, d.measure, This.data.fontSize))) + "," +
                                ((d.textPosition.y + (This.legendFontSizeMarginDifference / 2) + 20) - (textMeasurementService.measureSvgTextHeight(SVGLegend.getTextProperties(true, d.measure, This.data.fontSize)) / 4)) * arrowPos +
                                ") rotate(270 0 0)";
                        })
                        .classed("PMIndicator", true);
                }
                else if (data.primaryType === "Both") {
                    itemsEnter.select(".PMlegendItems").append("path")
                        .attr("d", (d) => {
                            let arrowPos = "";
                            if (!d.primaryIndicator) {
                                arrowPos = "-";
                            }
                            return "M0 0L0 " + This.data.fontSize + "L" + arrowPos + This.data.fontSize / 2 + " " + This.data.fontSize / 2 + "Z";
                        })
                        .attr("transform", (d) => {
                            let arrowPos = 1;
                            if (!d.primaryIndicator) {
                                arrowPos = 0.98;
                            }
                            return "translate(" + (d.textPosition.x + textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(true, d.measure, This.data.fontSize))) + "," +
                                ((d.textPosition.y + (This.legendFontSizeMarginDifference / 2) + 20) - (textMeasurementService.measureSvgTextHeight(SVGLegend.getTextProperties(true, d.measure, This.data.fontSize)) / 4)) * arrowPos +
                                ") rotate(270 0 0)";
                        })
                        .classed("PMIndicator", true);
                }
                if (this.secondaryExists) {
                    mergedLegendItems
                        .select(".secondaryMeasure")
                        .attr("x", (d) => { return d.textPosition.x; })
                        .attr("y", (d) => { return d.textPosition.y + (This.legendFontSizeMarginDifference) + 40; })
                        .style("fill", data.labelColor)
                        .style("font-size", PixelConverter.fromPoint(data.fontSize));
                    itemsEnter.select(".SMlegendItems").append("path")
                        .attr("d", (d) => {
                            let arrowPos = "";
                            if (!d.secondaryIndicator) {
                                arrowPos = "-";
                            }
                            return "M0 0L0 " + This.data.fontSize + "L" + arrowPos + This.data.fontSize / 2 + " " + This.data.fontSize / 2 + "Z";
                        })
                        .attr("transform", (d) => {
                            let arrowPos = 1;
                            if (!d.secondaryIndicator) {
                                arrowPos = 0.98;
                            }
                            return "translate(" + (d.textPosition.x + textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(true, d["secondaryMeasure"], This.data.fontSize))) + ","
                                + ((d.textPosition.y + (This.legendFontSizeMarginDifference) + 40) - textMeasurementService.measureSvgTextHeight(SVGLegend.getTextProperties(true, d["secondaryMeasure"], This.data.fontSize)) / 4) * arrowPos
                                + ") rotate(270 0 0)";
                        })
                        .classed("SMIndicator", true);
                }
            }
        }
        else if (this.secondaryExists) {
            if (this.isTopOrBottom(this.orientation)) {
                mergedLegendItems
                    .select(".secondaryMeasure")
                    .attr("x", (d) => d.textPosition.x)
                    .attr("y", (d) => 2 * d.textPosition.y + This.legendFontSizeMarginDifference / 2)
                    .style("fill", data.labelColor)
                    .style("font-size", PixelConverter.fromPoint(data.fontSize));
                itemsEnter.select(".SMlegendItems").append("path")
                    .attr("d", (d) => {
                        let arrowPos = "";
                        if (!d.secondaryIndicator) {
                            arrowPos = "-";
                        }
                        return "M0 0L0 " + This.data.fontSize + "L" + arrowPos + This.data.fontSize / 2 + " " + This.data.fontSize / 2 + "Z";
                    })
                    .attr("transform", (d) => {
                        let arrowPos = 1;
                        if (!d.secondaryIndicator) {
                            arrowPos = 0.95;
                        }
                        return "translate(" + (d.textPosition.x + textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(true, d["secondaryMeasure"], This.data.fontSize))) + "," +
                            ((2 * d.textPosition.y + This.legendFontSizeMarginDifference / 2) - (textMeasurementService.measureSvgTextHeight(SVGLegend.getTextProperties(true, d["secondaryMeasure"], This.data.fontSize)) / 4)) * arrowPos
                            + ") rotate(270 0 0)";
                    })
                    .classed("SMIndicator", true);
            }
            else {
                mergedLegendItems
                    .select(".secondaryMeasure")
                    .attr("x", (d) => { return d.textPosition.x; })
                    .attr("y", (d) => { return d.textPosition.y + 20 + This.legendFontSizeMarginDifference / 2; })
                    .style("fill", data.labelColor)
                    .style("font-size", PixelConverter.fromPoint(data.fontSize));
                itemsEnter.select(".SMlegendItems").append("path")
                    .attr("d", (d) => {
                        let arrowPos = "";
                        if (!d.secondaryIndicator) {
                            arrowPos = "-";
                        }
                        return "M0 0L0 " + This.data.fontSize + "L" + arrowPos + This.data.fontSize / 2 + " " + This.data.fontSize / 2 + "Z";
                    })
                    .attr("transform", (d) => {
                        let arrowPos = 1;
                        if (!d.secondaryIndicator) {
                            arrowPos = 0.98;
                        }
                        return "translate(" + (d.textPosition.x + textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(true, d["secondaryMeasure"], This.data.fontSize)) + 1) + "," +
                            ((d.textPosition.y + 20 + This.legendFontSizeMarginDifference / 2) - textMeasurementService.measureSvgTextHeight(SVGLegend.getTextProperties(true, d["secondaryMeasure"], This.data.fontSize)) / 4) * arrowPos
                            + ") rotate(270 0 0)";
                    })
                    .classed("SMIndicator", true);
            }
        }
        // indicators
        itemsEnter.select(".PMIndicator")
            .style("fill", (d) => { return (d["primaryIndicator"] !== "" ? (d["primaryIndicator"] ? data.primaryUpArrowColor : data.primaryDownArrowColor) : "white"); })
            .style("fill-opacity", (d) => { return (d["primaryIndicator"] !== "" ? (d["primaryIndicator"] ? "1" : "1") : "0"); });
        itemsEnter.select(".SMIndicator")
            .style("fill", (d) => { return (d["secondaryIndicator"] !== "" ? (d["secondaryIndicator"] ? data.secondaryUpArrowColor : data.secondaryDownArrowColor) : "white"); })
            .style("fill-opacity", (d) => { return (d["secondaryIndicator"] !== "" ? (d["secondaryIndicator"] ? "1" : "1") : "0"); });

        if (this.interactivityService) {
            let behaviorOptions: LegendBehaviorOptions = {
                legendItems: mergedLegendItems,
                legendIcons: mergedLegendIcons,
                clearCatcher: this.clearCatcher,
                dataPoints: data.dataPoints,
                behavior: this.interactiveBehavior,
                interactivityServiceOptions: {
                    isLegend: true
                }
            };

            this.interactivityService.bind(behaviorOptions);
            this.interactiveBehavior.renderSelection(hasSelection);
        }

        legendItems
            .exit()
            .remove();

        this.drawNavigationArrows(layout.navigationArrows);

        this.updateLayout();
    }

    private static getStrokeDashArrayForLegend(style: LineStyle): string {
        switch (style) {
            case LineStyle.dashed: {
                return "7,5";
            }
            case LineStyle.dotted: {
                return "2.5,3.1";
            }
            case LineStyle.dotdash: {
                return "2.5,3.1,7,3.1";
            }
            case LineStyle.dashdot: {
                return "7,3.1,2.5,3.1";
            }
            case LineStyle.solid: {
                return null;
            }
        }
    }

    private normalizePosition(points: any[]): void {
        if (this.legendDataStartIndex >= points.length) {
            this.legendDataStartIndex = points.length - 1;
        }

        if (this.legendDataStartIndex < 0) {
            this.legendDataStartIndex = 0;
        }
    }

    private calculateTitleLayout(title: string): TitleLayout {

        const legendOffset = 10;
        let width = 0,
            hasTitle = !!title;

        if (hasTitle) {
            let isHorizontal = this.isTopOrBottom(this.orientation), maxMeasureLength = 0;
            if (isHorizontal) {
                let fontSizeMargin = this.legendFontSizeMarginValue > SVGLegend.DefaultTextMargin
                    ? SVGLegend.TextAndIconPadding + this.legendFontSizeMarginDifference
                    : SVGLegend.TextAndIconPadding;
                let fixedHorizontalIconShift = SVGLegend.TextAndIconPadding + SVGLegend.LegendIconRadius;
                let fixedHorizontalTextShift = SVGLegend.LegendIconRadius + fontSizeMargin + fixedHorizontalIconShift;
                // TODO This can be negative for narrow viewports. May need to rework this logic.
                maxMeasureLength = this.parentViewport.width * SVGLegend.LegendMaxWidthFactor - fixedHorizontalTextShift - SVGLegend.LegendEdgeMariginWidth;
            }
            else {
                maxMeasureLength = this.legendFontSizeMarginValue < SVGLegend.DefaultTextMargin ? SVGLegend.MaxTitleLength :
                    SVGLegend.MaxTitleLength + (SVGLegend.DefaultMaxLegendFactor * this.legendFontSizeMarginDifference);
            }

            let textProperties = SVGLegend.getTextProperties(true, title, this.data.fontSize);
            let text = title;
            let titleWidth = textMeasurementService.measureSvgTextWidth(textProperties);
            let primaryTitleWidth = 0, secondaryTitleWidth = 0;
            if (this.data["primaryTitle"])
                primaryTitleWidth = textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(true, this.data["primaryTitle"], this.data.fontSize));
            if (this.data["secondaryTitle"])
                secondaryTitleWidth = textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(true, this.data["secondaryTitle"], this.data.fontSize));
            // #code
            width = titleWidth > primaryTitleWidth ? (titleWidth > secondaryTitleWidth ? titleWidth : secondaryTitleWidth) : (primaryTitleWidth > secondaryTitleWidth ? primaryTitleWidth : secondaryTitleWidth);
            if (titleWidth > maxMeasureLength || primaryTitleWidth > maxMeasureLength
                || secondaryTitleWidth > maxMeasureLength) {

                text = textMeasurementService.getTailoredTextOrDefault(textProperties, maxMeasureLength);
                width = maxMeasureLength;
                if (this.data["primaryTitle"]) {
                    this.primaryTitle = this.data["primaryTitle"] = textMeasurementService.getTailoredTextOrDefault(
                        SVGLegend.getTextProperties(true, this.data["primaryTitle"],
                            this.data.fontSize), maxMeasureLength);
                }
                if (this.data["secondaryTitle"]) {
                    this.secondaryTitle = this.data["secondaryTitle"] = textMeasurementService.getTailoredTextOrDefault(
                        SVGLegend.getTextProperties(true, this.data["secondaryTitle"],
                            this.data.fontSize), maxMeasureLength);
                }
            }
            else {
                this.primaryTitle = this.data["primaryTitle"];
                this.secondaryTitle = this.data["secondaryTitle"];
            }

            if (isHorizontal) {
                width += SVGLegend.TitlePadding;
                // Adding primary title and secondary title when legend is either on left or right
            } else {
                let legendWidth = parseFloat(this.svg.style("width"));
                if (width < maxMeasureLength || width < primaryTitleWidth || width < secondaryTitleWidth) {
                    text = textMeasurementService.getTailoredTextOrDefault(textProperties, legendWidth);
                    let primTitle = textMeasurementService.getTailoredTextOrDefault(SVGLegend.getTextProperties
                        (true, this.data["primaryTitle"], this.data.fontSize), legendWidth - legendOffset);
                    if (this.data["primaryTitle"]
                        && (primTitle !== "..." || legendWidth < primaryTitleWidth)
                        && legendWidth !== 0) {
                        this.primaryTitle = this.data["primaryTitle"] = primTitle;
                    }
                    if (this.data["secondaryTitle"]) {
                        let secTitle = textMeasurementService.getTailoredTextOrDefault(SVGLegend.getTextProperties
                            (true, this.data["secondaryTitle"], this.data.fontSize), legendWidth - legendOffset);
                        if (this.data["secondaryTitle"]
                            && (secTitle !== "..." || legendWidth < secondaryTitleWidth)
                            && legendWidth !== 0) {
                            this.secondaryTitle = this.data["secondaryTitle"] = secTitle;
                        }
                    }
                }
            }

            return {
                text,
                width,
                x: 0,
                y: 0,
                height: textMeasurementService.estimateSvgTextHeight(textProperties)
            };
        }

        return null;
    }

    /** Performs layout offline for optimal perfomance */
    private calculateLayout(data: LegendData, autoWidth: boolean): LegendLayout {
        let dataPoints = data.dataPoints;
        if (data.dataPoints.length === 0) {
            return {
                numberOfItems: 0,
                title: null,
                navigationArrows: []
            };
        }

        this.legendFontSizeMarginValue = PixelConverter.fromPointToPixel(this.data && this.data.fontSize !== undefined ? this.data.fontSize : SVGLegend.DefaultFontSizeInPt);
        this.legendFontSizeMarginDifference = (this.legendFontSizeMarginValue - SVGLegend.DefaultTextMargin);

        this.normalizePosition(dataPoints);
        if (this.legendDataStartIndex < dataPoints.length) {
            dataPoints = dataPoints.slice(this.legendDataStartIndex);
        }

        let title: TitleLayout = this.calculateTitleLayout(data.title);

        let navArrows: NavigationArrow[];
        let numberOfItems: number;

        if (this.isTopOrBottom(this.orientation)) {
            navArrows = this.isScrollable ? this.calculateHorizontalNavigationArrowsLayout(title) : [];
            numberOfItems = this.calculateHorizontalLayout(dataPoints, title, navArrows);
        }
        else {
            navArrows = this.isScrollable ? this.calculateVerticalNavigationArrowsLayout(title) : [];
            numberOfItems = this.calculateVerticalLayout(dataPoints, title, navArrows, autoWidth);
        }

        return {
            numberOfItems,
            title,
            navigationArrows: navArrows
        };
    }

    private updateNavigationArrowLayout(navigationArrows: NavigationArrow[], remainingDataLength: number, visibleDataLength: number): void {
        if (this.legendDataStartIndex === 0) {
            navigationArrows.shift();
        }

        let lastWindow = this.arrowPosWindow;
        this.arrowPosWindow = visibleDataLength;

        if (navigationArrows && navigationArrows.length > 0 && this.arrowPosWindow === remainingDataLength) {
            this.arrowPosWindow = lastWindow;
            navigationArrows.length = navigationArrows.length - 1;
        }
    }

    private calculateHorizontalNavigationArrowsLayout(title: TitleLayout): NavigationArrow[] {
        let height = SVGLegend.LegendArrowHeight;
        let width = SVGLegend.LegendArrowWidth;
        let translateY = (this.viewport.height / 2) - (height / 2);

        let data: NavigationArrow[] = [];
        let rightShift = title ? title.x + title.width : 0;
        let arrowLeft = svgManipulation.createArrow(width, height, 180 /*angle*/);
        let arrowRight = svgManipulation.createArrow(width, height, 0 /*angle*/);

        data.push({
            x: rightShift,
            y: translateY,
            path: arrowLeft.path,
            rotateTransform: arrowLeft.transform,
            dataType: NavigationArrowType.Decrease
        });

        data.push({
            x: this.parentViewport.width - width,
            y: translateY,
            path: arrowRight.path,
            rotateTransform: arrowRight.transform,
            dataType: NavigationArrowType.Increase
        });

        return data;
    }

    private calculateVerticalNavigationArrowsLayout(title: TitleLayout): NavigationArrow[] {
        let height = SVGLegend.LegendArrowHeight;
        let width = SVGLegend.LegendArrowWidth;

        let verticalCenter = this.viewport.height / 2;
        let data: NavigationArrow[] = [];
        let rightShift = verticalCenter + height / 2;
        let arrowTop = svgManipulation.createArrow(width, height, 270 /*angle*/);
        let arrowBottom = svgManipulation.createArrow(width, height, 90 /*angle*/);
        let titleHeight = title ? title.height : 0;

        // When legend orientation is left or right
        if (this.isLeftOrRight(this.orientation)) {
            let translateY = 0;
            let hasTitle = !_.isEmpty(title);
            if (hasTitle) {
                if (this.showPrimary && this.secondaryExists) {
                    translateY = title.y * 3;
                    titleHeight = titleHeight * 3.5;
                } else {
                    translateY = title.y * 2;
                    titleHeight = titleHeight * 2.5;
                }
            }
            else {
                translateY = /*height +*/ SVGLegend.LegendArrowOffset / 2;
            }
        }

        data.push({
            x: rightShift,
            y: width + titleHeight,
            path: arrowTop.path,
            rotateTransform: arrowTop.transform,
            dataType: NavigationArrowType.Decrease
        });

        data.push({
            x: rightShift,
            y: this.parentViewport.height - height,
            path: arrowBottom.path,
            rotateTransform: arrowBottom.transform,
            dataType: NavigationArrowType.Increase
        });

        return data;
    }

    /**
     * Calculates the widths for each horizontal legend item.
     */
    private static calculateHorizontalLegendItemsWidths(
        dataPoints: LegendDataPoint[],
        availableWidth: number,
        iconPadding: number,
        fontSize: number,
        fontFamily: string,
    ): LegendItem[] {

        let dataPointsLength = dataPoints.length;

        // Set the maximum amount of space available to each item. They can use less, but can"t go over this number.
        let maxItemWidth = dataPointsLength > 0 ? availableWidth / dataPointsLength | 0 : 0;
        let maxItemTextWidth = maxItemWidth - iconPadding;

        // Makes sure the amount of space available to each item is at least SVGLegend.MaxTextLength wide.
        // If you had many items and/or a narrow amount of available width, the availableTextWidthPerItem would be small, essentially making everything ellipsis.
        // This prevents that from happening by giving each item at least SVGLegend.MaxTextLength of space.
        if (maxItemTextWidth < SVGLegend.MaxTextLength) {
            maxItemTextWidth = SVGLegend.MaxTextLength;
            maxItemWidth = maxItemTextWidth + iconPadding;
        }

        // Make sure the availableWidthPerItem is less than the availableWidth. This lets the long text properly add ellipsis when we"re displaying one item at a time.
        if (maxItemWidth > availableWidth) {
            maxItemWidth = availableWidth;
            maxItemTextWidth = maxItemWidth - iconPadding;
        }

        let occupiedWidth = 0;
        let legendItems: LegendItem[] = [];

        // Add legend items until we can"t fit any more (the last one doesn"t fit) or we"ve added all of them
        for (let dataPoint of dataPoints) {

            let textProperties = SVGLegend.getTextProperties(false, dataPoint.label, fontSize);
            let itemTextWidth = textMeasurementService.measureSvgTextWidth(textProperties);
            let desiredWidth = itemTextWidth + iconPadding;
            let overMaxWidth = desiredWidth > maxItemWidth;
            let actualWidth = overMaxWidth ? maxItemWidth : desiredWidth;
            occupiedWidth += actualWidth;

            if (occupiedWidth >= availableWidth) {

                // Always add at least 1 element
                if (legendItems.length === 0) {

                    legendItems.push({
                        dataPoint: dataPoint,
                        textProperties: textProperties,
                        desiredWidth: desiredWidth,
                        desiredOverMaxWidth: true,
                        width: desiredWidth
                    });

                    // Set the width to the amount of space we actually have
                    occupiedWidth = availableWidth;
                } else {
                    // Subtract the width from what was just added since it won"t fit
                    occupiedWidth -= actualWidth;
                }
                break;
            }

            legendItems.push({
                dataPoint: dataPoint,
                textProperties: textProperties,
                desiredWidth: desiredWidth,
                desiredOverMaxWidth: overMaxWidth,
                width: desiredWidth
            });
        }

        // If there are items at max width, evenly redistribute the extra space to them
        let itemsOverMax = legendItems.filter((li: LegendItem) => li.desiredOverMaxWidth);
        let numItemsOverMax = itemsOverMax.length;

        if (numItemsOverMax > 0) {
            let extraWidth = availableWidth - occupiedWidth;

            for (let item of itemsOverMax) {
                // Divvy up the extra space and add it to the max
                // We need to do this calculation in every loop since the remainingWidth may not be changed by the same amount every time
                let extraWidthPerItem = extraWidth / numItemsOverMax;
                let newMaxItemWidth = maxItemWidth + extraWidthPerItem;

                let usedExtraWidth: number;
                if (item.desiredWidth <= newMaxItemWidth) {
                    // If the item doesn"t need all the extra space, it"s not at max anymore
                    item.desiredOverMaxWidth = false;
                    usedExtraWidth = item.desiredWidth - maxItemWidth;
                } else {
                    // Otherwise the item is taking up all the extra space so update the actual width to indicate that
                    item.width = newMaxItemWidth;
                    usedExtraWidth = newMaxItemWidth - maxItemWidth;
                }

                extraWidth -= usedExtraWidth;
                numItemsOverMax--;
            }
        }

        return legendItems;
    }

    private calculateHorizontalLayout(dataPoints: LegendDataPoint[], title: TitleLayout, navigationArrows: NavigationArrow[]): number {
        let HorizontalTextShift = 4;
        let HorizontalIconShift = 11;
        let fontSizeBiggerThanDefault = this.legendFontSizeMarginDifference > 0;

        let fontSizeMargin = fontSizeBiggerThanDefault
            ? SVGLegend.TextAndIconPadding + this.legendFontSizeMarginDifference
            : SVGLegend.TextAndIconPadding;

        let occupiedWidth = 0;

        const firstDataPointMarkerShape: MarkerShape = dataPoints && dataPoints[0] && dataPoints[0].markerShape;
        // Getting value to shift text and icon
        let fixedTextShift = (this.getMarkerShapeWidth(firstDataPointMarkerShape) / 2) + fontSizeMargin + HorizontalTextShift;
        let fixedIconShift = HorizontalIconShift + (fontSizeBiggerThanDefault ?
            this.legendFontSizeMarginDifference : 0);

        let iconTotalItemPadding = this.getMarkerShapeWidth(firstDataPointMarkerShape) + fontSizeMargin * 3;

        let numberOfItems: number = dataPoints.length;
        // Getting primary measure and secondary measure lengths
        let primaryMeasureLength = 0;
        if (this.showPrimary) {
            primaryMeasureLength = dataPoints[0]["measure"].length;
        }
        let secondaryMeasurelength = 0;
        if (dataPoints && dataPoints[0] && dataPoints[0]["secondaryMeasure"] && !!dataPoints[0]["secondaryMeasure"].length && dataPoints[0]["secondaryMeasure"].length > 0) {
            secondaryMeasurelength = dataPoints[0]["secondaryMeasure"].length;
        }

        if (title) {
            occupiedWidth += title.width;
            // get the Y coordinate which is the middle of the container + the middle of the text height - the delta of the text
            title.y = fixedTextShift;
        }

        // if an arrow should be added, we add space for it
        if (this.legendDataStartIndex > 0) {
            occupiedWidth += SVGLegend.LegendArrowOffset;
        }

        // Calculate the width for each of the legend items
        let dataPointsLength = dataPoints.length;
        // new code
        let parentWidth = this.parentViewport.width;
        let maxTextLength = dataPointsLength > 0
            ? (((parentWidth - occupiedWidth) - (iconTotalItemPadding * dataPointsLength)) / dataPointsLength) | 0
            : 0;
        maxTextLength = maxTextLength > SVGLegend.MaxTextLength ? maxTextLength : SVGLegend.MaxTextLength;
        // #code
        for (let itr = 0; itr < dataPointsLength; itr++) {
            let dataPoint = dataPoints[itr];
            const markerShapeWidth = this.getMarkerShapeWidth(dataPoint.markerShape);

            dataPoint.glyphPosition = {
                // the space taken so far + the radius + the margin / radiusFactor to prevent huge spaces
                x: occupiedWidth + markerShapeWidth / 2 + (this.legendFontSizeMarginDifference / this.getLegendIconFactor(dataPoint.markerShape)),
                // The middle of the container but a bit lower due to text not being in the middle (qP for example making middle between q and P)
                y: fixedIconShift,
            };

            dataPoint.textPosition = {
                x: occupiedWidth + fixedTextShift,
                y: fixedTextShift,
            };

            let textProperties;
            textProperties = SVGLegend.getTextProperties(false, dataPoint.label, this.data.fontSize);
            let labelwidth = textMeasurementService.measureSvgTextWidth(textProperties);
            let primaryWidth = 0, secondaryWidth = 0;
            if (this.showPrimary) {
                primaryWidth = textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(false, dataPoint.measure, this.data.fontSize));
            }
            if (this.secondaryExists) {
                secondaryWidth = textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(false, dataPoint["secondaryMeasure"], this.data.fontSize));
            }
            let width = labelwidth > primaryWidth ? (labelwidth > secondaryWidth ? labelwidth : secondaryWidth) : (primaryWidth > secondaryWidth ? primaryWidth : secondaryWidth);
            width += 15; // indicators
            let spaceTakenByItem = 0;
            if (width < maxTextLength) {
                spaceTakenByItem = iconTotalItemPadding + width;
                if (this.showPrimary) {
                    dataPoint.measure = dataPoint.measure;
                }
            } else {
                let text = textMeasurementService.getTailoredTextOrDefault(
                    textProperties,
                    maxTextLength);
                dataPoint.label = text;
                if (this.showPrimary) {
                    dataPoint.measure = textMeasurementService.getTailoredTextOrDefault(
                        SVGLegend.getTextProperties(false, dataPoint.measure, this.data.fontSize),
                        maxTextLength);
                }
                if (this.secondaryExists) {
                    dataPoint["secondaryMeasure"] = textMeasurementService.getTailoredTextOrDefault(SVGLegend.getTextProperties(false, dataPoint["secondaryMeasure"], this.data.fontSize),
                        maxTextLength);
                }
                spaceTakenByItem = iconTotalItemPadding + maxTextLength;
            }
            occupiedWidth += spaceTakenByItem;
            if (occupiedWidth > parentWidth) {
                numberOfItems = itr;
                break;
            }
        }
        // #code
        this.visibleLegendWidth = occupiedWidth;
        this.updateNavigationArrowLayout(navigationArrows, dataPointsLength, numberOfItems);

        return numberOfItems;
    }

    private getMarkerShapeWidth(markerShape: MarkerShape): number {
        switch (markerShape) {
            case MarkerShape.longDash: {
                return Markers.LegendIconLineTotalWidth;
            }
            default: {
                return SVGLegend.LegendIconRadius * 2;
            }
        }
    }

    private getLegendIconFactor(markerShape: MarkerShape): number {
        switch (markerShape) {
            case MarkerShape.circle:
            case MarkerShape.square: {
                return 5;
            }
            default: {
                return 6;
            }
        }
    }

    private getIconScale(markerShape: MarkerShape): number {
        switch (markerShape) {
            case MarkerShape.circle:
            case MarkerShape.square: {
                return SVGLegend.LegendIconRadius / Markers.defaultSize;
            }
            default: {
                return 1;
            }
        }
    }

    private calculateVerticalLayout(
        dataPoints: LegendDataPoint[],
        title: TitleLayout,
        navigationArrows: NavigationArrow[],
        autoWidth: boolean
    ): number {
        let _this = this;
        // check if we need more space for the margin, or use the default text padding
        let fontSizeBiggerThenDefault = this.legendFontSizeMarginDifference > 0;
        let fontFactor = fontSizeBiggerThenDefault ? this.legendFontSizeMarginDifference : 0;
        // calculate the size needed after font size change
        let verticalLegendHeight = 20 + fontFactor;
        let spaceNeededByTitle = 15 + (fontFactor * 1.3);
        let extraShiftForTextAlignmentToIcon = 4 + (fontFactor * 1.3);
        let totalSpaceOccupiedThusFar = 0; // verticalLegendHeight;
        // the default space for text and icon radius + the margin after the font size change

        const firstDataPointMarkerShape: MarkerShape = dataPoints && dataPoints[0] && dataPoints[0].markerShape;

        let fixedHorizontalIconShift: number = SVGLegend.TextAndIconPadding
            + this.getMarkerShapeWidth(firstDataPointMarkerShape) / 2
            + this.legendFontSizeMarginDifference;

        let fixedHorizontalTextShift = fixedHorizontalIconShift * 2;
        // check how much space is needed
        let maxHorizontalSpaceAvaliable = autoWidth
            ? this.parentViewport.width * SVGLegend.LegendMaxWidthFactor
            - fixedHorizontalTextShift - SVGLegend.LegendEdgeMariginWidth
            : this.lastCalculatedWidth
            - fixedHorizontalTextShift - SVGLegend.LegendEdgeMariginWidth;
        let numberOfItems: number = dataPoints.length;

        let maxHorizontalSpaceUsed = 0;
        let parentHeight = this.parentViewport.height;

        if (title) {
            totalSpaceOccupiedThusFar += spaceNeededByTitle;
            title.x = SVGLegend.TextAndIconPadding;
            title.y = spaceNeededByTitle;
            maxHorizontalSpaceUsed = title.width || 0;
            if (this.data["primaryTitle"] && this.data["secondaryTitle"] && this.showPrimary) {
                spaceNeededByTitle = 3 * title.y + this.legendFontSizeMarginDifference / 2;
                totalSpaceOccupiedThusFar += spaceNeededByTitle;
            }
            else if (this.data["secondaryTitle"] || this.data["primaryTitle"]) {
                spaceNeededByTitle = 2 * title.y + this.legendFontSizeMarginDifference / 2;
                totalSpaceOccupiedThusFar += spaceNeededByTitle;
            }
            else {
                totalSpaceOccupiedThusFar += spaceNeededByTitle;
            }
        }
        else {
            totalSpaceOccupiedThusFar += spaceNeededByTitle;
        }
        for (let index = 0; index < dataPoints.length; index++) {
            if (dataPoints[index]["secondaryMeasure"] && dataPoints[index]["secondaryMeasure"] !== "") {
                this.secondaryExists = 1;
                break;
            }
            else {
                this.secondaryExists = 0;
                continue;
            }
        }
        // if an arrow should be added, we add space for it
        if (this.legendDataStartIndex > 0)
            totalSpaceOccupiedThusFar += SVGLegend.LegendArrowOffset;

        let dataPointsLength = dataPoints.length;
        for (let i = 0; i < dataPointsLength; i++) {
            let dp = dataPoints[i];
            let textProperties = SVGLegend.getTextProperties(false, dp.label, this.data.fontSize);

            dp.glyphPosition = {
                x: fixedHorizontalIconShift,
                y: totalSpaceOccupiedThusFar + fontFactor
            };

            dp.textPosition = {
                x: fixedHorizontalTextShift,
                y: totalSpaceOccupiedThusFar + extraShiftForTextAlignmentToIcon
            };
            if (this.showPrimary) {
                totalSpaceOccupiedThusFar = totalSpaceOccupiedThusFar + 20 + (this.legendFontSizeMarginDifference / 2);
            }
            if (this.secondaryExists) {
                totalSpaceOccupiedThusFar = totalSpaceOccupiedThusFar + 20 + (this.legendFontSizeMarginDifference / 2);
            }
            let labelwidth = textMeasurementService.measureSvgTextWidth(textProperties);
            let primaryWidth = 0, secondaryWidth = 0;
            if (this.showPrimary) {
                primaryWidth = textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(false, dp.measure, this.data.fontSize));
            }
            if (this.secondaryExists) {
                secondaryWidth = textMeasurementService.measureSvgTextWidth(SVGLegend.getTextProperties(false, dp["secondaryMeasure"], this.data.fontSize));
            }

            // TODO: [PERF] Get rid of this extra measurement, and modify
            // getTailoredTextToReturnWidth + Text
            let width = labelwidth > primaryWidth ? (labelwidth > secondaryWidth ? labelwidth : secondaryWidth) : (primaryWidth > secondaryWidth ? primaryWidth : secondaryWidth);
            width += 15;
            // #code
            if (width > maxHorizontalSpaceUsed) {
                maxHorizontalSpaceUsed = width;
            }

            if (width > maxHorizontalSpaceAvaliable) {
                let text = textMeasurementService.getTailoredTextOrDefault(
                    textProperties,
                    maxHorizontalSpaceAvaliable);
                dp.label = text;
                // new code
                // Getting measure value
                if (this.showPrimary) {
                    dp.measure = textMeasurementService.getTailoredTextOrDefault(
                        SVGLegend.getTextProperties(false, dp.measure, this.data.fontSize),
                        maxHorizontalSpaceAvaliable - 18);
                }
                if (this.secondaryExists) {
                    dp["secondaryMeasure"] = textMeasurementService.getTailoredTextOrDefault(SVGLegend.getTextProperties(false, dp["secondaryMeasure"], this.data.fontSize),
                        maxHorizontalSpaceAvaliable - 18);
                }
            }
            // new code
            else {
                dp.measure = dp.measure;
            }

            totalSpaceOccupiedThusFar += verticalLegendHeight;

            if (totalSpaceOccupiedThusFar > parentHeight) {
                numberOfItems = i;
                break;
            }
        }

        if (autoWidth) {
            if (maxHorizontalSpaceUsed < maxHorizontalSpaceAvaliable) {
                this.lastCalculatedWidth = this.viewport.width = Math.ceil(maxHorizontalSpaceUsed + fixedHorizontalTextShift + SVGLegend.LegendEdgeMariginWidth);
            } else {
                this.lastCalculatedWidth = this.viewport.width = Math.ceil(this.parentViewport.width * SVGLegend.LegendMaxWidthFactor);
            }
        }
        else {
            this.viewport.width = this.lastCalculatedWidth;
        }

        this.visibleLegendHeight = totalSpaceOccupiedThusFar - verticalLegendHeight;

        navigationArrows.forEach(d => d.x = this.lastCalculatedWidth / 2);
        this.updateNavigationArrowLayout(navigationArrows, dataPointsLength, numberOfItems);

        return numberOfItems;
    }

    private drawNavigationArrows(layout: NavigationArrow[]): void {
        let arrows: Selection<BaseType, NavigationArrow, HTMLElement, any> = this.group.selectAll(SVGLegend.NavigationArrow.selectorName)
            .data(layout);

        arrows.exit().remove();

        arrows = arrows.merge(arrows
            .enter()
            .append("g")
            .classed(SVGLegend.NavigationArrow.className, true)
        )
            .on("click", (event, d: NavigationArrow) => {
                let pos = this.legendDataStartIndex;
                this.legendDataStartIndex = d.dataType === NavigationArrowType.Increase
                    ? pos + this.arrowPosWindow : pos - this.arrowPosWindow;
                this.drawLegendInternal(this.data, this.parentViewport, false);
            })
            .attr("transform", (d: NavigationArrow) => svgManipulation.translate(d.x, d.y));

        let path: Selection<SVGPathElement, NavigationArrow, BaseType, any> = arrows.selectAll<SVGPathElement, NavigationArrow>("path")
            .data((data) => [data]);

        path.exit().remove();
        path = path
            .enter()
            .append("path")
            .merge(path);

        path.attr("d", (d: NavigationArrow) => d.path)
            .attr("transform", (d: NavigationArrow) => d.rotateTransform);
    }

    private isTopOrBottom(orientation: LegendPosition): boolean {
        switch (orientation) {
            case LegendPosition.Top:
            case LegendPosition.Bottom:
            case LegendPosition.BottomCenter:
            case LegendPosition.TopCenter:
                return true;
            default:
                return false;
        }
    }

    private isCentered(orientation: LegendPosition): boolean {
        switch (orientation) {
            case LegendPosition.BottomCenter:
            case LegendPosition.LeftCenter:
            case LegendPosition.RightCenter:
            case LegendPosition.TopCenter:
                return true;
            default:
                return false;
        }
    }

    // new code
    private isLeftOrRight(orientation): boolean {
        switch (orientation) {
            case LegendPosition.Left:
            case LegendPosition.Right:
            case LegendPosition.LeftCenter:
            case LegendPosition.RightCenter:
                return true;
            default:
                return false;
        }
    }


    public reset(): void { }

    private static getTextProperties(
        isTitle,
        text,
        fontSize
    ): TextProperties {
        return {
            text: text,
            fontFamily: isTitle
                ? SVGLegend.DefaultTitleFontFamily
                : SVGLegend.DefaultFontFamily,
            fontSize: PixelConverter.fromPoint(fontSize || SVGLegend.DefaultFontSizeInPt)
        };
    }

    private setTooltipToLegendItems(data: LegendData) {
        // we save the values to tooltip before cut
        for (let dataPoint of data.dataPoints) {
            dataPoint.tooltip = dataPoint.label;
        }
    }
}
