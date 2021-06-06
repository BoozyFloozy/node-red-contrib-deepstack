const clonedeep = require('lodash.clonedeep')

const deepstack = require('./deepstack-integration');
const im = require('./image-manipulation');

/*
 * Object Detection node
 *
 * Status:
 *   - grey   dot  "Idling, waiting for images to process"
 *   - green  dot  "Successfully processed an image and result delivered"
 *   - yellow ring "Processing image"
 *   - red    ring "Error processing image"
 */

module.exports = function(RED) {
    function ObjectDetection(config) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.server = RED.nodes.getNode(config.server);

        node.status({fill:"grey",shape:"dot",text:"idling"});
        node.on('input', function(msg, send, done) {
            node.status({fill:"yellow",shape:"ring",text:"Processing..."});

            objectDetection(msg, config, node.server).then(outputs =>{
                node.status({fill: "green", shape: "dot", text: "success"});
                setTimeout(function () {
                    node.status({fill: "grey", shape: "dot", text: "idling"});
                }, 2000);

                node.send(outputs);
            }).catch(reason => {
                node.status({fill:"red",shape:"ring",text:"error detecting objects"});
                node.error(reason);
                console.log(reason);
            });
        });
    }
    RED.nodes.registerType("deepstack-object-detection", ObjectDetection, {});
};

/**
 * Construct the object detection outputs.
 *
 * @param msg the incomming msg object.
 * @param config the node configuration.
 * @param server the server configuration node.
 * @returns {Promise<unknown>}
 */
function objectDetection(msg, config, server, custom) {

    return new Promise((resolve, reject) => {

        let original = msg.payload;

        if (!original) {
            reject("No image provided. Please set msg.payload.")
        }
    
        if (original.type === 'Buffer') {
            original = Buffer.from(original.data)
        }

        deepstack.objectDetection(
            original,
            server,
            config.confidence/100,
            custom,
        ).then(async result => {
            msg.payload = result.predictions;
            msg.success = result.success;
            msg.duration = result.duration || 0;
            msg.originalImage = original;
            if (config.drawPredictions) {
                msg.outlinedImage = await im.outlineImage(
                    original,
                    deepstack.getOutlines(result.predictions),
                    config.outlineColor);
            }

            let outputs = [msg];

            for (let i = 0; i < config.filters.length; i++){
                let filterResult = result.predictions.filter(function (p) {
                    return p.label == config.filters[i];
                });

                let filterOutput = undefined;
                if (filterResult.length > 0) {
                    filterOutput = clonedeep(msg);
                    filterOutput.payload = filterResult;
                    if (config.drawPredictions) {
                        filterOutput.outlinedImage = await im.outlineImage(
                            original,
                            deepstack.getOutlines(filterResult),
                            config.outlineColor);
                    }
                }
                outputs.push(filterOutput);
            }

            resolve(outputs);
        }).catch(reject);
    });
}