<template>
  <div class="demo">
    <div class="top">
      <video ref="video" width="640" height="426" autoplay playsinline></video>
      <span class="plus">+</span>
      <img ref="image" :src="src" width="640" height="426" />
    </div>
    <div class="buttonset">
      Select background
      <button @click="setBg(0)">1</button>
      <button @click="setBg(1)">2</button>
      <button @click="setBg(2)">3</button>
      <button @click="setBg(3)">4</button>
    </div>
    <div>
      <canvas ref="canvas"></canvas>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import * as bodyPix from '@tensorflow-models/body-pix'
import '@tensorflow/tfjs-backend-webgl'
import { PersonSegmentation, SemanticPersonSegmentation } from '@tensorflow-models/body-pix/dist/types.js'
import { getInputSize } from '@tensorflow-models/body-pix/dist/util.js'
import { ModelConfig } from '@tensorflow-models/body-pix/dist/body_pix_model'

type ImageType = HTMLImageElement|HTMLVideoElement|HTMLCanvasElement
const offScreenCanvases: {[name: string]: HTMLCanvasElement} = {}

interface Map<T> {
  [key: string]: T;
}

const bgs = [
  require('@/assets/i/bg.jpg'),
  require('@/assets/i/bgCity.jpg'),
  require('@/assets/i/bgBeach.jpg'),
  require('@/assets/i/bgBeach2.jpg')
]

export default Vue.extend({
  name: 'Home',
  components: {
  },
  data () {
    return {
      bg: 0,
      video: {} as HTMLVideoElement
    }
  },
  computed: {
    src () {
      return bgs[this.bg]
    }
  },
  methods: {
    setBg (index: number) {
      this.bg = index
    },
    renderImageToCanvas (image: ImageType, canvas: HTMLCanvasElement) {
      const { width, height } = image
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx!.drawImage(image, 0, 0, width, height)
    },
    renderImageDataToCanvas (image: ImageData, canvas: HTMLCanvasElement) {
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')
      ctx!.putImageData(image, 0, 0)
    },
    renderImageDataToOffScreenCanvas (image: ImageData, canvasName: string): HTMLCanvasElement {
      const canvas = this.ensureOffscreenCanvasCreated(canvasName)
      this.renderImageDataToCanvas(image, canvas)
      return canvas
    },
    createOffScreenCanvas (): HTMLCanvasElement {
      const offScreenCanvas = document.createElement('canvas')
      return offScreenCanvas
    },
    ensureOffscreenCanvasCreated (id: string): HTMLCanvasElement {
      if (!offScreenCanvases[id]) {
        offScreenCanvases[id] = this.createOffScreenCanvas()
      }
      return offScreenCanvases[id]
    },
    drawAndBlurImageOnCanvas (
      image: ImageType,
      blurAmount: number,
      canvas: HTMLCanvasElement
    ) {
      const { height, width } = image
      const ctx = canvas.getContext('2d')
      canvas.width = width
      canvas.height = height
      ctx!.clearRect(0, 0, width, height)
      ctx!.save();
      // tslint:disable:no-any
      (ctx as any).filter = `blur(${blurAmount}px)`
      ctx!.drawImage(image, 0, 0, width, height)
      ctx!.restore()
    },
    drawAndBlurImageOnOffScreenCanvas (
      image: ImageType,
      blurAmount: number,
      offscreenCanvasName: string
    ): HTMLCanvasElement {
      const canvas = this.ensureOffscreenCanvasCreated(offscreenCanvasName);
      if (blurAmount === 0) {
        this.renderImageToCanvas(image, canvas);
      } else {
        this.drawAndBlurImageOnCanvas(image, blurAmount, canvas);
      }
      return canvas
    },
    createPersonMask (
      multiPersonSegmentation: PersonSegmentation[]|SemanticPersonSegmentation,
      edgeBlurAmount: number
    ): HTMLCanvasElement {
      const backgroundMaskImage = bodyPix.toMask(
        multiPersonSegmentation,
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 0, g: 0, b: 0, a: 0 }
      )

      const backgroundMask =
        this.renderImageDataToOffScreenCanvas(backgroundMaskImage, 'mask')
      if (edgeBlurAmount === 0) {
        return backgroundMask
      } else {
        return this.drawAndBlurImageOnOffScreenCanvas(
          backgroundMask,
          edgeBlurAmount,
          'blurredMask'
        )
      }
    },
    flipCanvasHorizontal (canvas: HTMLCanvasElement) {
      const ctx = canvas.getContext('2d')
      ctx!.scale(-1, 1)
      ctx!.translate(-canvas.width, 0)
    },
    drawWithCompositing (
      ctx: CanvasRenderingContext2D, image: HTMLCanvasElement|ImageType,
      compositOperation: string
    ) {
      ctx.globalCompositeOperation = compositOperation
      ctx.drawImage(image, 0, 0)
    },
    drawBg (
      canvas: HTMLCanvasElement,
      image: ImageType,
      bg: ImageType,
      multiPersonSegmentation: SemanticPersonSegmentation | PersonSegmentation[],
      edgeBlurAmount = 3,
      flipHorizontal = false
    ) {
      const bgImage = this.drawAndBlurImageOnOffScreenCanvas(
        bg, 0, 'bg')

      canvas.width = bgImage.width
      canvas.height = bgImage.height

      const ctx = canvas.getContext('2d')

      if (Array.isArray(multiPersonSegmentation) &&
        multiPersonSegmentation.length === 0) {
        ctx!.drawImage(bgImage, 0, 0)
        return
      }
      const personMask = this.createPersonMask(multiPersonSegmentation, edgeBlurAmount)

      ctx!.save()
      if (flipHorizontal) {
        this.flipCanvasHorizontal(canvas)
      }
      // draw the original image on the final canvas
      const [height, width] = getInputSize(image)
      ctx!.drawImage(image, 0, 0, width, height)
      // "destination-in" - "The existing canvas content is kept where both the
      // new shape and existing canvas content overlap. Everything else is made
      // transparent."
      // crop what's not the person using the mask from the original image
      this.drawWithCompositing(ctx!, personMask, 'destination-in')
      // "destination-over" - "The existing canvas content is kept where both the
      // new shape and existing canvas content overlap. Everything else is made
      // transparent."
      // draw the blurred background on top of the original image where it doesn't
      // overlap.
      this.drawWithCompositing(ctx!, bg, 'destination-over')
      ctx!.restore()
    },
    loadBodyPix () {
      const options = {
        multiplier: 0.75,
        stride: 32,
        quantBytes: 4,
        architecture: 'MobileNetV1',
        outputStride: 16
      } as ModelConfig
      bodyPix.load(options)
        .then(net => this.perform(net))
    },
    async perform (net: any) {
      const segmentation = await net.segmentPerson(
        this.$refs.video)

      this.drawBg(
        this.$refs.canvas as HTMLCanvasElement,
        this.$refs.video as any,
        this.$refs.image as any,
        segmentation,
        3,
        true
      )
      this.perform(net)
    }
  },
  mounted () {
    this.video = this.$refs.video as HTMLVideoElement
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
        this.video.srcObject = stream
        this.video.play()

        this.video.onplaying = () => {
          ;(this.$refs.canvas as HTMLCanvasElement).width = (this.$refs.video as HTMLVideoElement).width
          ;(this.$refs.canvas as HTMLCanvasElement).height = (this.$refs.video as HTMLVideoElement).height
        }

        this.loadBodyPix()
      })
    }
  }
})
</script>
<style>
  video {
    -webkit-transform: scaleX(-1);
    transform: scaleX(-1);
  }
</style>
