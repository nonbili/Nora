import { ConfigPlugin, withPodfile } from '@expo/config-plugins'

// Xcode 27 fails the build when a pod target is below its minimum supported
// deployment target (15.0), e.g. the RNSVG and RNCAsyncStorage resource bundles.
const RAISE_POD_DEPLOYMENT_TARGETS = `
    deployment_target = podfile_properties['ios.deploymentTarget']
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        target_version = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if target_version && Gem::Version.new(target_version) < Gem::Version.new(deployment_target)
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = deployment_target
        end
      end
    end
`

const withIosPodDeploymentTarget: ConfigPlugin = (config) => {
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents

    if (!contents.includes("podfile_properties['ios.deploymentTarget']\n    installer.pods_project")) {
      contents = contents.replace(
        /(react_native_post_install\([\s\S]*?\n\s*\)\n)/,
        `$1${RAISE_POD_DEPLOYMENT_TARGETS}`,
      )
    }

    config.modResults.contents = contents

    return config
  })
}

export default withIosPodDeploymentTarget
